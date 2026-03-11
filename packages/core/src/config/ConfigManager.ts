import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

export interface UserConfig {
  openai?: {
    apiKey?: string;
    baseUrl?: string;
  };
  anthropic?: {
    apiKey?: string;
  };
  google?: {
    apiKey?: string;
  };
  user?: {
    name?: string;
    email?: string;
  };
  preferences?: {
    defaultProject?: string;
    theme?: string;
    language?: string;
    logLevel?: 'debug' | 'info' | 'warn' | 'error';
    autoSave?: boolean;
    showTips?: boolean;
  };
  server?: {
    defaultHost?: string;
    defaultPort?: number;
    cors?: {
      enabled?: boolean;
      origins?: string[];
    };
  };
  llm?: {
    defaultProvider?: 'openai' | 'anthropic' | 'google';
    timeout?: number;
    maxRetries?: number;
    temperature?: number;
  };
}

export class ConfigManager {
  private configDir: string;
  private configFile: string;
  private userConfigFile: string;
  private projectsFile: string;
  private masterKey: string;
  private deviceKey: string;

  constructor() {
    // 配置目录路径
    this.configDir = path.join(process.cwd(), '.kal');
    this.configFile = path.join(this.configDir, 'config.env');
    this.userConfigFile = path.join(this.configDir, 'user-config.json');
    this.projectsFile = path.join(this.configDir, 'projects.json');

    // 确保配置目录存在
    this.ensureConfigDir();

    // 生成或获取加密密钥（延迟初始化）
    this.masterKey = this.getOrCreateMasterKey();
    this.deviceKey = this.getOrCreateDeviceKey();
  }

  private getOrCreateMasterKey(): string {
    const keyFile = path.join(os.homedir(), '.kal-master-key');

    if (fs.existsSync(keyFile)) {
      return fs.readFileSync(keyFile, 'utf8').trim();
    }

    // 生成新的主密钥
    const key = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(keyFile, key, { mode: 0o600 }); // 只有用户可读写
    return key;
  }

  private getOrCreateDeviceKey(): string {
    const keyFile = path.join(this.configDir, '.device-key');

    if (fs.existsSync(keyFile)) {
      const content = fs.readFileSync(keyFile, 'utf8').trim();
      const parts = content.split(':');
      if (parts.length === 2) {
        return parts[1]!;
      }
    }

    // 生成设备特定密钥
    const machineId = this.getMachineId();
    const deviceSalt = crypto.randomBytes(16).toString('hex');
    const deviceKey = crypto.pbkdf2Sync(machineId, deviceSalt, 100000, 32, 'sha256').toString('hex');

    fs.writeFileSync(keyFile, `${deviceSalt}:${deviceKey}`, { mode: 0o600 });
    return deviceKey;
  }

  private getMachineId(): string {
    // 生成基于机器特征的唯一标识
    const hostname = os.hostname();
    const platform = os.platform();
    const arch = os.arch();
    const userInfo = os.userInfo();

    const machineInfo = `${hostname}-${platform}-${arch}-${userInfo.username}`;
    return crypto.createHash('sha256').update(machineInfo).digest('hex');
  }

  private ensureConfigDir(): void {
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }

    // 创建子目录
    const subDirs = ['cache', 'logs', 'user-sessions'];
    subDirs.forEach(dir => {
      const dirPath = path.join(this.configDir, dir);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
    });
  }

  private encrypt(text: string): string {
    // 二次加密：先用设备密钥加密，再用主密钥加密
    const firstEncryption = this.encryptWithKey(text, this.deviceKey);
    const secondEncryption = this.encryptWithKey(firstEncryption, this.masterKey);
    return `v2:${secondEncryption}`;
  }

  private decrypt(encryptedText: string): string {
    // 检查加密版本
    if (encryptedText.startsWith('v2:')) {
      const payload = encryptedText.substring(3);
      // 二次解密：先用主密钥解密，再用设备密钥解密
      const firstDecryption = this.decryptWithKey(payload, this.masterKey);
      return this.decryptWithKey(firstDecryption, this.deviceKey);
    } else {
      // 兼容旧版本单次加密
      return this.decryptWithKey(encryptedText, this.masterKey);
    }
  }

  private encryptWithKey(text: string, key: string): string {
    // 使用简单的 Base64 编码 + 异或加密，避免复杂的 crypto API 问题
    const keyBuffer = Buffer.from(key, 'hex');
    const textBuffer = Buffer.from(text, 'utf8');
    const encrypted = Buffer.alloc(textBuffer.length);

    for (let i = 0; i < textBuffer.length; i++) {
      encrypted[i] = textBuffer[i]! ^ keyBuffer[i % keyBuffer.length]!;
    }

    return Buffer.concat([Buffer.from('ENC:'), encrypted]).toString('base64');
  }

  private decryptWithKey(encryptedText: string, key: string): string {
    try {
      const data = Buffer.from(encryptedText, 'base64');

      if (!data.subarray(0, 4).equals(Buffer.from('ENC:'))) {
        throw new Error('Invalid encryption header');
      }

      const encrypted = data.subarray(4);
      const keyBuffer = Buffer.from(key, 'hex');
      const decrypted = Buffer.alloc(encrypted.length);

      for (let i = 0; i < encrypted.length; i++) {
        decrypted[i] = encrypted[i]! ^ keyBuffer[i % keyBuffer.length]!;
      }

      return decrypted.toString('utf8');
    } catch (error) {
      throw new Error('Failed to decrypt data');
    }
  }

  public loadConfig(): UserConfig {
    const config: UserConfig = {};

    // 加载环境变量配置
    if (fs.existsSync(this.configFile)) {
      const envContent = fs.readFileSync(this.configFile, 'utf8');
      const envLines = envContent.split('\n');

      for (const line of envLines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const [key, ...valueParts] = trimmed.split('=');
          const value = valueParts.join('=');

          if (key && value) {
            try {
              // 解密敏感信息
              const decryptedValue = this.isEncrypted(value) ? this.decrypt(value) : value;
              this.setConfigValue(config, key, decryptedValue);
            } catch (error) {
              console.warn(`Failed to decrypt config value for ${key}:`, error);
              // 如果解密失败，跳过这个配置项
            }
          }
        }
      }
    }

    // 加载用户配置
    if (fs.existsSync(this.userConfigFile)) {
      try {
        const userConfig = JSON.parse(fs.readFileSync(this.userConfigFile, 'utf8'));
        Object.assign(config, userConfig);
      } catch (error) {
        console.warn('Failed to load user config:', error);
      }
    }

    // 从环境变量加载（优先级最高）
    if (process.env.OPENAI_API_KEY) {
      config.openai = { ...config.openai, apiKey: process.env.OPENAI_API_KEY };
    }
    if (process.env.OPENAI_BASE_URL) {
      config.openai = { ...config.openai, baseUrl: process.env.OPENAI_BASE_URL };
    }
    if (process.env.ANTHROPIC_API_KEY) {
      config.anthropic = { ...config.anthropic, apiKey: process.env.ANTHROPIC_API_KEY };
    }
    if (process.env.GOOGLE_API_KEY) {
      config.google = { ...config.google, apiKey: process.env.GOOGLE_API_KEY };
    }

    return config;
  }

  private isEncrypted(value: string): boolean {
    return value.startsWith('v2:') || value.startsWith('ENC:') || (value.includes(':') && value.split(':').length >= 2);
  }

  private setConfigValue(config: UserConfig, key: string, value: string): void {
    const upperKey = key.toUpperCase();

    if (upperKey.endsWith('_API_KEY')) {
      const provider = upperKey.replace('_API_KEY', '').toLowerCase();

      switch (provider) {
        case 'OPENAI':
          config.openai = { ...config.openai, apiKey: value };
          break;
        case 'ANTHROPIC':
          config.anthropic = { ...config.anthropic, apiKey: value };
          break;
        case 'GOOGLE':
          config.google = { ...config.google, apiKey: value };
          break;
        default:
          // 动态支持其他提供商
          (config as any)[provider] = { ...(config as any)[provider], apiKey: value };
          break;
      }
    } else if (upperKey.endsWith('_BASE_URL')) {
      const provider = upperKey.replace('_BASE_URL', '').toLowerCase();

      switch (provider) {
        case 'OPENAI':
          config.openai = { ...config.openai, baseUrl: value };
          break;
        default:
          // 动态支持其他提供商的 Base URL
          (config as any)[provider] = { ...(config as any)[provider], baseUrl: value };
          break;
      }
    }
    // 可以继续扩展其他配置项
  }

  public saveApiKey(provider: string, apiKey: string): void {
    const encryptedKey = this.encrypt(apiKey);
    const keyName = `${provider.toUpperCase()}_API_KEY`;

    let configContent = '';
    if (fs.existsSync(this.configFile)) {
      configContent = fs.readFileSync(this.configFile, 'utf8');
    }

    // 更新或添加 API 密钥
    const lines = configContent.split('\n');
    let keyUpdated = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line && line.startsWith(`${keyName}=`)) {
        lines[i] = `${keyName}=${encryptedKey}`;
        keyUpdated = true;
        break;
      }
    }

    if (!keyUpdated) {
      lines.push(`${keyName}=${encryptedKey}`);
    }

    fs.writeFileSync(this.configFile, lines.join('\n'), { mode: 0o600 });
  }

  public removeApiKey(provider: string): void {
    const keyName = `${provider.toUpperCase()}_API_KEY`;

    if (!fs.existsSync(this.configFile)) {
      return;
    }

    const configContent = fs.readFileSync(this.configFile, 'utf8');
    const lines = configContent.split('\n');
    const filteredLines = lines.filter(line => !line.startsWith(`${keyName}=`));

    fs.writeFileSync(this.configFile, filteredLines.join('\n'), { mode: 0o600 });
  }

  public updateUserConfig(updates: Partial<UserConfig>): void {
    let currentConfig = {};

    if (fs.existsSync(this.userConfigFile)) {
      try {
        currentConfig = JSON.parse(fs.readFileSync(this.userConfigFile, 'utf8'));
      } catch (error) {
        console.warn('Failed to load current user config:', error);
      }
    }

    const newConfig = this.deepMerge(currentConfig, updates);
    fs.writeFileSync(this.userConfigFile, JSON.stringify(newConfig, null, 2));
  }

  private deepMerge(target: any, source: any): any {
    const result = { ...target };

    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }

    return result;
  }

  public addRecentProject(projectPath: string): void {
    if (!fs.existsSync(this.projectsFile)) {
      return;
    }

    try {
      const projects = JSON.parse(fs.readFileSync(this.projectsFile, 'utf8'));

      // 移除重复项
      projects.recentProjects = projects.recentProjects.filter(
        (p: any) => p.path !== projectPath
      );

      // 添加到开头
      projects.recentProjects.unshift({
        path: projectPath,
        name: path.basename(projectPath),
        lastUsed: new Date().toISOString()
      });

      // 限制最近项目数量
      projects.recentProjects = projects.recentProjects.slice(0, 10);

      fs.writeFileSync(this.projectsFile, JSON.stringify(projects, null, 2));
    } catch (error) {
      console.warn('Failed to update recent projects:', error);
    }
  }

  public getConfigDir(): string {
    return this.configDir;
  }

  public initializeConfig(): void {
    // 如果配置文件不存在，从示例创建
    if (!fs.existsSync(this.configFile)) {
      const exampleFile = path.join(this.configDir, 'config.env.example');
      if (fs.existsSync(exampleFile)) {
        fs.copyFileSync(exampleFile, this.configFile);
        fs.chmodSync(this.configFile, 0o600); // 设置为只有用户可读写
      } else {
        // 创建基本配置文件
        const basicConfig = [
          '# KAL-AI 配置文件',
          '# 请勿将此文件提交到版本控制系统',
          '',
          '# OpenAI 配置',
          '# OPENAI_API_KEY=your_openai_api_key_here',
          '# OPENAI_BASE_URL=https://api.openai.com/v1',
          '',
          '# 其他 LLM 服务配置',
          '# ANTHROPIC_API_KEY=your_anthropic_key_here',
          '# GOOGLE_API_KEY=your_google_key_here',
          ''
        ].join('\n');

        fs.writeFileSync(this.configFile, basicConfig, { mode: 0o600 });
      }
    }
  }

  public validateConfig(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const config = this.loadConfig();

    // 检查是否至少配置了一个 LLM 提供商
    const hasOpenAI = config.openai?.apiKey;
    const hasAnthropic = config.anthropic?.apiKey;
    const hasGoogle = config.google?.apiKey;

    if (!hasOpenAI && !hasAnthropic && !hasGoogle) {
      errors.push('至少需要配置一个 LLM 提供商的 API 密钥');
    }

    // 检查 OpenAI 配置
    if (hasOpenAI && config.openai?.baseUrl) {
      try {
        new URL(config.openai.baseUrl);
      } catch {
        errors.push('OpenAI Base URL 格式无效');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  public exportConfig(includeSecrets: boolean = false): string {
    const config = this.loadConfig();

    if (!includeSecrets) {
      // 移除敏感信息
      const safeConfig = JSON.parse(JSON.stringify(config));
      if (safeConfig.openai?.apiKey) safeConfig.openai.apiKey = '***';
      if (safeConfig.anthropic?.apiKey) safeConfig.anthropic.apiKey = '***';
      if (safeConfig.google?.apiKey) safeConfig.google.apiKey = '***';
      return JSON.stringify(safeConfig, null, 2);
    }

    return JSON.stringify(config, null, 2);
  }
}