import '@xyflow/react/dist/style.css';
import { useState } from 'react';
import Flow from "./Flow";
import { AppSidebar } from "./AppSidebar";
import { ProjectLoader } from "./components/ProjectLoader";
import { StateManager } from "./components/StateManager";
import { ConfigEditor } from "./components/ConfigEditor";
import { StatusBar } from "./components/StatusBar";
import { useProjectStore } from "./store/projectStore";

export default function App() {
  const project = useProjectStore((state) => state.project);
  const [currentView, setCurrentView] = useState<"flow" | "state" | "config">("flow");

  if (!project) {
    return <ProjectLoader />;
  }

  return (
    <>
      <AppSidebar currentView={currentView} onViewChange={setCurrentView}>
        {currentView === "flow" && <Flow />}
        {currentView === "state" && <StateManager />}
        {currentView === "config" && <ConfigEditor />}
      </AppSidebar>
      <StatusBar />
    </>
  );
}
