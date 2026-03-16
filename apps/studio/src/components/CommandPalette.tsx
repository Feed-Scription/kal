import { useEffect, useMemo, useState } from "react";
import { Command, CornerDownLeft, Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useStudioCommands, useWorkbench } from "@/kernel/hooks";
import { useCommandRegistry } from "@/kernel/commands";

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.isContentEditable
  );
}

export function CommandPalette() {
  const { commandPaletteOpen } = useWorkbench();
  const { commands } = useCommandRegistry();
  const { redo, setCommandPaletteOpen, toggleCommandPalette, undo } = useStudioCommands();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        toggleCommandPalette();
        return;
      }

      if (commandPaletteOpen || isEditableTarget(event.target)) {
        return;
      }

      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === "z") {
        event.preventDefault();
        void undo();
        return;
      }

      if (
        (event.metaKey || event.ctrlKey) &&
        ((event.shiftKey && event.key.toLowerCase() === "z") || event.key.toLowerCase() === "y")
      ) {
        event.preventDefault();
        void redo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [commandPaletteOpen, redo, toggleCommandPalette, undo]);

  useEffect(() => {
    if (!commandPaletteOpen) {
      setQuery("");
      setSelectedIndex(0);
    }
  }, [commandPaletteOpen]);

  const filteredCommands = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return commands;
    }

    return commands.filter((command) => {
      const haystack = [
        command.title,
        command.description,
        command.section,
        ...(command.keywords ?? []),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalized);
    });
  }, [commands, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleExecute = async (index: number) => {
    const command = filteredCommands[index];
    if (!command) {
      return;
    }

    setCommandPaletteOpen(false);
    await Promise.resolve(command.run());
  };

  return (
    <Dialog open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen}>
      <DialogContent
        className="max-w-2xl p-0"
        onKeyDown={async (event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setSelectedIndex((current) => Math.min(current + 1, Math.max(filteredCommands.length - 1, 0)));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setSelectedIndex((current) => Math.max(current - 1, 0));
          } else if (event.key === "Enter") {
            event.preventDefault();
            await handleExecute(selectedIndex);
          }
        }}
      >
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Command className="size-4" />
            Command Palette
          </DialogTitle>
          <DialogDescription>
            通过统一 command bus 执行 Studio workbench、project 与 workflow 命令。
          </DialogDescription>
        </DialogHeader>

        <div className="border-b px-5 py-4">
          <div className="relative">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索命令、视图或工作区..."
              className="pl-10"
            />
          </div>
        </div>

        <div className="max-h-[60vh] overflow-auto p-3">
          {filteredCommands.length === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
              没有匹配的命令。
            </div>
          ) : (
            <div className="space-y-2">
              {filteredCommands.map((command, index) => (
                <button
                  key={command.id}
                  type="button"
                  onClick={() => void handleExecute(index)}
                  className={`flex w-full items-start justify-between rounded-xl border px-4 py-3 text-left transition-colors ${
                    selectedIndex === index ? "border-primary bg-primary/5" : "hover:bg-muted/40"
                  }`}
                >
                  <div className="space-y-1">
                    <div className="font-medium">{command.title}</div>
                    <div className="text-xs text-muted-foreground">{command.description}</div>
                    <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{command.section}</div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {command.shortcut ? <span className="rounded border px-1.5 py-0.5">{command.shortcut}</span> : null}
                    {selectedIndex === index ? <CornerDownLeft className="size-3.5" /> : null}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
