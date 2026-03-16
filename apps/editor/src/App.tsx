import '@xyflow/react/dist/style.css';
import { useState } from 'react';
import Flow from "./Flow";
import SessionEditor from "./SessionEditor";
import { AppSidebar } from "./AppSidebar";
import { ProjectLoader } from "./components/ProjectLoader";
import { StateManager } from "./components/StateManager";
import { ConfigEditor } from "./components/ConfigEditor";
import { StatusBar } from "./components/StatusBar";
import { useProjectStore } from "./store/projectStore";

export type ViewType = "flow" | "state" | "config" | "session";

export default function App() {
  const project = useProjectStore((state) => state.project);
  const [currentView, setCurrentView] = useState<ViewType>("flow");

  if (!project) {
    return <ProjectLoader />;
  }

  return (
    <>
      <AppSidebar currentView={currentView} onViewChange={setCurrentView}>
        <div className="relative h-full w-full">
          <div className={`absolute inset-0 transition-opacity duration-300 ease-[var(--ease-apple)] ${currentView === "flow" ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
            <Flow />
          </div>
          <div className={`absolute inset-0 transition-opacity duration-300 ease-[var(--ease-apple)] ${currentView === "state" ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
            <StateManager />
          </div>
          <div className={`absolute inset-0 transition-opacity duration-300 ease-[var(--ease-apple)] ${currentView === "config" ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
            <ConfigEditor />
          </div>
          <div className={`absolute inset-0 transition-opacity duration-300 ease-[var(--ease-apple)] ${currentView === "session" ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
            <SessionEditor />
          </div>
        </div>
      </AppSidebar>
      <StatusBar />
    </>
  );
}
