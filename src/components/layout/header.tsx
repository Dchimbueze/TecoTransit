"use client";

import { useState } from 'react';
import Link from "next/link";
import { usePathname } from 'next/navigation';
import { Route, Menu, Shield, MessageSquare, HelpCircle, Home } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/auth-context";
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger, SheetClose } from '@/components/ui/sheet';
import { ThemeToggle } from '../theme-toggle';
import { ClientOnly } from '../client-only';

export default function Header() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  if (pathname.startsWith('/admin')) {
    return null;
  }

  const navLinks: { href: string; label: string; icon?: React.ElementType }[] = [
      { href: "/", label: "Home", icon: Home },
      { href: "/book", label: "Book a Trip" },
      { href: "/faqs", label: "FAQs", icon: HelpCircle },
      { href: "/feedback", label: "Feedback", icon: MessageSquare },
  ];
  
  const NavLink = ({ href, label, className = '' }: { href: string; label: string; className?: string }) => (
      <Link href={href} className={cn(
          "font-medium transition-colors hover:text-primary",
          pathname === href ? "text-primary" : "text-muted-foreground",
          className
       )}>
        {label}
      </Link>
  );

  return (
    <header className="bg-card shadow-sm sticky top-0 z-40">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center h-16">
          <Link href="/" className="flex items-center gap-2 font-bold text-lg text-primary">
            <Route className="h-6 w-6" />
            <span className="font-headline">TecoTransit</span>
          </Link>
          
          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-6 text-sm">
             {navLinks.map(link => {
                if (link.href === "/book") {
                  return (
                    <Button asChild key={link.href} size="sm">
                       <Link href={link.href}>{link.label}</Link>
                    </Button>
                  )
                }
                return <NavLink key={link.href} href={link.href} label={link.label}/>
             })}
             <ClientOnly>
                <ThemeToggle />
             </ClientOnly>
          </nav>

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
                <SheetContent side="left" className="w-[240px]">
                    <Link href="/" className="flex items-center gap-2 font-bold text-lg text-primary mb-8">
                        <Route className="h-6 w-6" />
                        <span className="font-headline">TecoTransit</span>
                    </Link>
                    <nav className="flex flex-col gap-6">
                        {navLinks.map(link => {
                            const Icon = link.icon;
                            return (
                                <SheetClose asChild key={link.href}>
                                    <Link href={link.href} className={cn(
                                        "flex items-center gap-3 text-lg font-medium transition-colors hover:text-primary",
                                        pathname === link.href ? "text-primary" : "text-muted-foreground",
                                    )}>
                                        {Icon && <Icon className="h-5 w-5" />}
                                        <span>{link.label}</span>
                                    </Link>
                                </SheetClose>
                            );
                        })}
                        {user && (
                            <SheetClose asChild>
                                <Link href="/admin" className={cn(
                                    "flex items-center gap-3 text-lg font-medium transition-colors hover:text-primary",
                                    pathname.startsWith('/admin') ? "text-primary" : "text-muted-foreground"
                                )}>
                                    <Shield className="h-5 w-5" />
                                    <span>Admin</span>
                                </Link>
                            </SheetClose>
                        )}
                    </nav>
                </SheetContent>
                </Sheet>
            </ClientOnly>
          </div>
        </div>
      </div>
    </header>
  );
}
