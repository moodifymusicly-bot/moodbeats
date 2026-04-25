import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

// Providers
import { PlayerProvider } from "@/lib/PlayerContext";
import { SettingsProvider } from "@/lib/SettingsContext";

// Layout
import { BottomNav } from "@/components/layout/BottomNav";
import { MiniPlayer } from "@/components/layout/MiniPlayer";

// Pages
import Landing from "@/pages/Landing";
import Home from "@/pages/Home";
import MoodDetect from "@/pages/MoodDetect";
import MoodPlaylist from "@/pages/MoodPlaylist";
import Player from "@/pages/Player";
import Search from "@/pages/Search";
import Library from "@/pages/Library";
import Settings from "@/pages/Settings";

const queryClient = new QueryClient();

function RedirectToLanding() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation("/landing");
  }, [setLocation]);
  return null;
}

function Router() {
  const [location] = useLocation();
  const showBottomNav = !["/landing", "/mood-detect", "/player"].includes(location) && location !== "/";

  return (
    <>
      <Switch>
        <Route path="/" component={RedirectToLanding} />
        <Route path="/landing" component={Landing} />
        <Route path="/home" component={Home} />
        <Route path="/mood-detect" component={MoodDetect} />
        <Route path="/mood-playlist" component={MoodPlaylist} />
        <Route path="/player" component={Player} />
        <Route path="/search" component={Search} />
        <Route path="/library" component={Library} />
        <Route path="/settings" component={Settings} />
        <Route component={NotFound} />
      </Switch>
      <MiniPlayer />
      {showBottomNav && <BottomNav />}
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SettingsProvider>
      <PlayerProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </PlayerProvider>
      </SettingsProvider>
    </QueryClientProvider>
  );
}

export default App;
