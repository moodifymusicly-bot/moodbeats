import { Link, useLocation } from "wouter";
import { Home, Search, Activity, Library, Settings } from "lucide-react";
import { motion } from "framer-motion";

export const BottomNav = () => {
  const [location] = useLocation();

  const navItems = [
    { icon: Home, label: "Home", path: "/home" },
    { icon: Search, label: "Search", path: "/search" },
    { icon: Activity, label: "Mix", path: "/mood-detect" },
    { icon: Library, label: "Library", path: "/library" },
    { icon: Settings, label: "Settings", path: "/settings" },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-safe pt-2">
      <div className="glass-panel rounded-2xl mb-4 px-2 py-3 mx-auto max-w-md shadow-lg shadow-black/20">
        <div className="flex items-center justify-between">
          {navItems.map((item) => {
            const isActive = location === item.path;
            const Icon = item.icon;
            
            return (
              <Link key={item.path} href={item.path} className="relative flex flex-col items-center justify-center w-16 h-12">
                <motion.div
                  animate={{ 
                    color: isActive ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
                    y: isActive ? -2 : 0
                  }}
                  className="z-10"
                >
                  <Icon size={24} strokeWidth={isActive ? 2.5 : 2} />
                </motion.div>
                
                {isActive && (
                  <motion.div
                    layoutId="nav-indicator"
                    className="absolute -bottom-1 w-1 h-1 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]"
                    initial={false}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                )}
                
                <span className={`text-[10px] mt-1 font-medium ${isActive ? "text-primary" : "text-muted-foreground/0 hidden"}`}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
};
