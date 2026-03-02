import { useState } from "react";
import { useProjectStore } from "@/store/projectStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Save } from "lucide-react";

export function ConfigEditor() {
  const project = useProjectStore((state) => state.project);
  const saveConfig = useProjectStore((state) => state.saveConfig);
  const [config, setConfig] = useState(project?.config);
  const [saving, setSaving] = useState(false);

  if (!project || !config) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveConfig(config);
      alert("配置已保存");
    } catch (error) {
      alert("保存失败: " + (error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full w-full overflow-auto bg-background p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">项目设置</h1>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="mr-2 size-4" />
            {saving ? "保存中..." : "保存"}
          </Button>
        </div>

        <div className="space-y-6 rounded-lg border bg-card p-6">
          <div>
            <h2 className="mb-4 text-lg font-semibold">基本信息</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium">项目名称</label>
                <Input
                  value={config.name}
                  onChange={(e) =>
                    setConfig({ ...config, name: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">版本</label>
                <Input
                  value={config.version}
                  onChange={(e) =>
                    setConfig({ ...config, version: e.target.value })
                  }
                />
              </div>
            </div>
          </div>

          <div>
            <h2 className="mb-4 text-lg font-semibold">引擎设置</h2>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <label className="mb-2 block text-sm font-medium">日志级别</label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs outline-none"
                  value={config.engine.logLevel}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      engine: { ...config.engine, logLevel: e.target.value },
                    })
                  }
                >
                  <option value="debug">debug</option>
                  <option value="info">info</option>
                  <option value="warn">warn</option>
                  <option value="error">error</option>
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">
                  最大并发 Flow
                </label>
                <Input
                  type="number"
                  value={config.engine.maxConcurrentFlows}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      engine: {
                        ...config.engine,
                        maxConcurrentFlows: parseInt(e.target.value),
                      },
                    })
                  }
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">
                  超时时间 (ms)
                </label>
                <Input
                  type="number"
                  value={config.engine.timeout}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      engine: {
                        ...config.engine,
                        timeout: parseInt(e.target.value),
                      },
                    })
                  }
                />
              </div>
            </div>
          </div>

          <div>
            <h2 className="mb-4 text-lg font-semibold">LLM 配置</h2>
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium">Provider</label>
                  <Input
                    value={config.llm.provider}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        llm: { ...config.llm, provider: e.target.value },
                      })
                    }
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium">
                    默认模型
                  </label>
                  <Input
                    value={config.llm.defaultModel}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        llm: { ...config.llm, defaultModel: e.target.value },
                      })
                    }
                  />
                </div>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">Base URL</label>
                <Input
                  value={config.llm.baseUrl || ""}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      llm: { ...config.llm, baseUrl: e.target.value },
                    })
                  }
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">API Key</label>
                <Input
                  type="password"
                  value={config.llm.apiKey || ""}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      llm: { ...config.llm, apiKey: e.target.value },
                    })
                  }
                />
              </div>
            </div>
          </div>

          <div>
            <h2 className="mb-4 text-lg font-semibold">重试配置</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium">
                  最大重试次数
                </label>
                <Input
                  type="number"
                  value={config.llm.retry.maxRetries}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      llm: {
                        ...config.llm,
                        retry: {
                          ...config.llm.retry,
                          maxRetries: parseInt(e.target.value),
                        },
                      },
                    })
                  }
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">
                  初始延迟 (ms)
                </label>
                <Input
                  type="number"
                  value={config.llm.retry.initialDelayMs}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      llm: {
                        ...config.llm,
                        retry: {
                          ...config.llm.retry,
                          initialDelayMs: parseInt(e.target.value),
                        },
                      },
                    })
                  }
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
