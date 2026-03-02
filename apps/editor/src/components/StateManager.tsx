import { useState } from "react";
import { useProjectStore } from "@/store/projectStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Plus } from "lucide-react";

export function StateManager() {
  const project = useProjectStore((state) => state.project);
  const saveState = useProjectStore((state) => state.saveState);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [newKey, setNewKey] = useState("");
  const [newType, setNewType] = useState("string");
  const [newValue, setNewValue] = useState("");

  if (!project) return null;

  const handleSave = async (key: string, type: string, value: any) => {
    const newState = {
      ...project.state,
      [key]: { type, value }
    };
    await saveState(newState);
    setEditingKey(null);
  };

  const handleDelete = async (key: string) => {
    const newState = { ...project.state };
    delete newState[key];
    await saveState(newState);
  };

  const handleAdd = async () => {
    if (!newKey.trim()) return;

    let parsedValue: any = newValue;
    try {
      if (newType === "number") {
        parsedValue = parseFloat(newValue);
      } else if (newType === "boolean") {
        parsedValue = newValue === "true";
      } else if (newType === "array" || newType === "object") {
        parsedValue = JSON.parse(newValue);
      }
    } catch (e) {
      alert("Invalid JSON format");
      return;
    }

    const newState = {
      ...project.state,
      [newKey]: { type: newType, value: parsedValue }
    };
    await saveState(newState);
    setNewKey("");
    setNewValue("");
  };

  return (
    <div className="h-full w-full overflow-auto bg-background p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">State 管理</h1>
          <Button variant="outline" size="sm">
            重置状态
          </Button>
        </div>

        <div className="rounded-lg border">
          <table className="w-full">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="p-3 text-left text-sm font-medium">Key</th>
                <th className="p-3 text-left text-sm font-medium">Type</th>
                <th className="p-3 text-left text-sm font-medium">Value</th>
                <th className="p-3 text-right text-sm font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(project.state).map(([key, stateValue]) => (
                <tr key={key} className="border-b last:border-0">
                  <td className="p-3 font-mono text-sm">{key}</td>
                  <td className="p-3 text-sm text-muted-foreground">
                    {stateValue.type}
                  </td>
                  <td className="p-3">
                    {editingKey === key ? (
                      <Input
                        defaultValue={JSON.stringify(stateValue.value)}
                        onBlur={(e) => {
                          try {
                            const parsed = JSON.parse(e.target.value);
                            handleSave(key, stateValue.type, parsed);
                          } catch {
                            handleSave(key, stateValue.type, e.target.value);
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.currentTarget.blur();
                          }
                        }}
                      />
                    ) : (
                      <span
                        className="cursor-pointer text-sm hover:text-primary"
                        onClick={() => setEditingKey(key)}
                      >
                        {typeof stateValue.value === "object"
                          ? JSON.stringify(stateValue.value)
                          : String(stateValue.value)}
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(key)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-lg border bg-card p-4">
          <h2 className="mb-4 text-lg font-semibold">添加新 State</h2>
          <div className="grid gap-4 md:grid-cols-4">
            <Input
              placeholder="Key"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
            />
            <select
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs outline-none"
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
            >
              <option value="string">string</option>
              <option value="number">number</option>
              <option value="boolean">boolean</option>
              <option value="array">array</option>
              <option value="object">object</option>
            </select>
            <Input
              placeholder="Value"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
            />
            <Button onClick={handleAdd}>
              <Plus className="mr-2 size-4" />
              添加
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
