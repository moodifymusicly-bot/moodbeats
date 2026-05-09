import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useSettings } from "@/lib/SettingsContext";

export default function Settings() {
  const { backgroundPlayback, setBackgroundPlayback } = useSettings();

  return (
    <div className="h-[100dvh] overflow-y-auto pb-safe-nav px-6 py-8">
      <h1 className="text-3xl font-medium tracking-tight text-primary-foreground mb-8">Settings</h1>

      <div className="space-y-8">
        <section>
          <h2 className="text-sm tracking-widest text-muted-foreground uppercase mb-4">Connections</h2>
          <div className="glass-panel rounded-2xl p-4 space-y-6">
            <div className="flex items-center justify-between">
              <Label htmlFor="spotify" className="text-base font-medium">Spotify Integration</Label>
              <Switch id="spotify" defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="youtube" className="text-base font-medium">YouTube Music</Label>
              <Switch id="youtube" />
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-sm tracking-widest text-muted-foreground uppercase mb-4">Playback</h2>
          <div className="glass-panel rounded-2xl p-4 space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <Label htmlFor="background-playback" className="text-base font-medium">Background Playback</Label>
                <p className="text-xs text-muted-foreground mt-1 font-light">
                  Play the track's YouTube video behind the player UI for a cinematic feel.
                </p>
              </div>
              <Switch
                id="background-playback"
                checked={backgroundPlayback}
                onCheckedChange={setBackgroundPlayback}
              />
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-sm tracking-widest text-muted-foreground uppercase mb-4">Preferences</h2>
          <div className="glass-panel rounded-2xl p-4 space-y-6">
            <div className="flex items-center justify-between">
              <Label htmlFor="notifications" className="text-base font-medium">Push Notifications</Label>
              <Switch id="notifications" defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="hq" className="text-base font-medium">High Quality Audio</Label>
              <Switch id="hq" defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="reduced-motion" className="text-base font-medium">Reduced Motion</Label>
              <Switch id="reduced-motion" />
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-sm tracking-widest text-muted-foreground uppercase mb-4">About</h2>
          <div className="glass-panel rounded-2xl p-4 space-y-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Version</span>
              <span className="font-mono">1.0.0</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Privacy Policy</span>
              <span className="text-primary cursor-pointer">Read</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Terms of Service</span>
              <span className="text-primary cursor-pointer">Read</span>
            </div>
          </div>
        </section>

        <button className="w-full py-4 text-destructive font-medium border border-destructive/20 rounded-2xl hover:bg-destructive/10 transition-colors">
          Sign Out
        </button>
      </div>
    </div>
  );
}
