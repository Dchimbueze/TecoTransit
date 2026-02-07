"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from 'next/navigation';
import { LogOut, Route, LayoutDashboard, Menu, HandCoins, Settings, MessageSquare, Car, BookOpenCheck, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { Sheet, SheetContent, SheetTrigger, SheetClose } from "../ui/sheet";
import { ThemeToggle } from "../theme-toggle";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { ClientOnly } from "../client-only";

export default function AdminHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const handleLogout = async () => {
    await signOut(auth);
    router.push("/admin/login");
  };

  const mainNavLinks = [
    { href: "/admin/dashboard", icon: LayoutDashboard, label: "Dashboard" },
    { href: "/admin/trips", icon: Car, label: "Trips" },
    { href: "/admin/bookings", icon: BookOpenCheck, label: "Bookings" },
  ];
  
  const settingsNavLinks = [
    { href: "/admin/pricing", icon: HandCoins, label: "Pricing" },
    { href: "/admin/feedback", icon: MessageSquare, label: "Feedback" },
    { href: "/admin/settings", icon: Settings, label: "Settings" },
  ];

  const allNavLinks = [...mainNavLinks, ...settingsNavLinks];

  return (
    <header className="bg-card shadow-sm sticky top-0 z-40">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center h-16">
          <Link href="/admin/dashboard" className="flex items-center gap-2 font-bold text-lg text-primary">
            <Route className="h-6 w-6" />
            <span className="font-headline hidden sm:inline">TecoTransit Admin</span>
          </Link>
          
          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-4">
             {mainNavLinks.map(({ href, icon: Icon, label }) => (
                <Link key={href} href={href} className={cn(
                    "flex items-center gap-2 text-sm font-medium transition-colors hover:text-primary",
                    pathname.startsWith(href) ? "text-primary" : "text-muted-foreground"
                    )}>
                    <Icon className="h-4 w-4" />
                    <span>{label}</span>
                </Link>
             ))}
             <ClientOnly>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-primary">
                            <Settings className="h-4 w-4" />
                            <span>Manage</span>
                            <ChevronDown className="h-4 w-4" />
                    </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                        {settingsNavLinks.map(({ href, icon: Icon, label }) => (
                            <DropdownMenuItem key={href} asChild>
                                <Link href={href} className={cn(
                                    "flex items-center gap-2",
                                    pathname.startsWith(href) ? "text-primary" : ""
                                    )}>
                                    <Icon className="h-4 w-4" />
                                    <span>{label}</span>
                                </Link>
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
             </ClientOnly>
          </nav>
           <div className="hidden md:flex items-center gap-2">
             <ClientOnly>
                <ThemeToggle />
             </ClientOnly>
             <Button variant="ghost" size="sm" onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                Logout
            </Button>
           </div>
          
          {/* Mobile Navigation */}
          <div className="md:hidden flex items-center gap-2">
            <ClientOnly>
                <ThemeToggle />
                <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
                <SheetTrigger asChild>
                    <Button variant="outline" size="icon">
                    <Menu className="h-5 w-5" />
                    <span className="sr-only">Open menu</span>
                    </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-[240px]">
                    <div className="flex flex-col h-full">
                        <div className="flex-grow">
                            <SheetClose asChild>
                                <Link href="/admin/dashboard" className="flex items-center gap-2 font-bold text-lg text-primary mb-8">
                                    <Route className="h-6 w-6" />
                                    <span className="font-headline">TecoTransit Admin</span>
                                </Link>
                            </SheetClose>
                            <nav className="flex flex-col gap-6">
                                {allNavLinks.map(({ href, icon: Icon, label }) => (
                                    <SheetClose asChild key={href}>
                                        <Link href={href} className={cn(
                                            "flex items-center gap-3 text-base font-medium transition-colors hover:text-primary",
                                            pathname.startsWith(href) ? "text-primary" : "text-muted-foreground"
                                        )}>
                                            <Icon className="h-5 w-5" />
                                            <span>{label}</span>
                                        </Link>
                                    </SheetClose>
                                ))}
                            </nav>
                        </div>
                        <div className="mt-auto">
                            <SheetClose asChild>
                                <Button variant="ghost" className="w-full justify-start" size="sm" onClick={handleLogout}>
                                    <LogOut className="mr-2 h-4 w-4" />
                                    Logout
                                </Button>
                            </SheetClose>
                        </div>
                    </div>
                </SheetContent>
                </Sheet>
            </ClientOnly>
          </div>

        </div>
      </div>
    </header>
  );
}
