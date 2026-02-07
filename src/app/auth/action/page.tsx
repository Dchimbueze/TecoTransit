
'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { auth } from '@/lib/firebase';
import { confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { KeyRound, Eye, EyeOff, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import Link from 'next/link';

const formSchema = z.object({
  password: z.string().min(6, { message: 'Password must be at least 6 characters.' }),
  confirmPassword: z.string(),
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords do not match.",
  path: ["confirmPassword"],
});

function AuthActionHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [mode, setMode] = useState<string | null>(null);
  const [oobCode, setOobCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  });

  useEffect(() => {
    const modeParam = searchParams.get('mode');
    const codeParam = searchParams.get('oobCode');

    setMode(modeParam);
    setOobCode(codeParam);

    if (!modeParam || !codeParam) {
      setError("Invalid link. The URL is missing required parameters.");
      setLoading(false);
      return;
    }

    if (modeParam === 'resetPassword') {
      verifyPasswordResetCode(auth, codeParam)
        .then((email) => {
          setEmail(email);
          setLoading(false);
        })
        .catch((err) => {
          console.error(err);
          setError("Invalid or expired link. Please request a new password reset link.");
          setLoading(false);
        });
    } else {
      setError(`Unsupported action: ${modeParam}.`);
      setLoading(false);
    }
  }, [searchParams]);

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!oobCode) {
      setError("An unexpected error occurred. Action code is missing.");
      return;
    }
    setLoading(true);
    try {
      await confirmPasswordReset(auth, oobCode, values.password);
      setSuccess(true);
      toast({
        title: "Password Reset Successfully",
        description: "You can now log in with your new password.",
      });
      // Redirect after a short delay
      setTimeout(() => router.push('/admin/login'), 3000);
    } catch (err) {
      console.error(err);
      setError("Failed to reset password. The link may have expired. Please try again.");
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to reset password. Please request a new link.",
      });
    } finally {
      setLoading(false);
    }
  }

  if (loading && !error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Verifying your link...</p>
      </div>
    );
  }

  if (error) {
    return (
       <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center">
            <AlertCircle className="mx-auto h-10 w-10 text-destructive" />
            <CardTitle className="text-2xl font-headline mt-2">Invalid Link</CardTitle>
            <CardDescription>{error}</CardDescription>
        </CardHeader>
        <CardFooter>
            <Button asChild className="w-full">
                <Link href="/admin/login">Return to Login</Link>
            </Button>
        </CardFooter>
      </Card>
    );
  }
  
  if (success) {
      return (
       <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center">
            <CheckCircle className="mx-auto h-10 w-10 text-green-500" />
            <CardTitle className="text-2xl font-headline mt-2">Success!</CardTitle>
            <CardDescription>Your password has been reset. Redirecting you to the login page shortly...</CardDescription>
        </CardHeader>
        <CardFooter>
            <Button asChild className="w-full">
                <Link href="/admin/login">Login Now</Link>
            </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm shadow-lg">
      <CardHeader className="text-center">
        <KeyRound className="mx-auto h-10 w-10 text-primary" />
        <CardTitle className="text-2xl font-headline mt-2">Reset Your Password</CardTitle>
        <CardDescription>Enter a new password for your account: {email}</CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>New Password</FormLabel>
                  <div className="relative">
                    <FormControl>
                      <Input
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        {...field}
                      />
                    </FormControl>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground"
                        onClick={() => setShowPassword(!showPassword)}
                        tabIndex={-1}
                    >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm New Password</FormLabel>
                  <FormControl>
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Resetting..." : "Reset Password"}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}


export default function AuthActionPage() {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-muted/40 p-4">
            <Suspense fallback={<div className="flex items-center justify-center h-screen"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
                <AuthActionHandler />
            </Suspense>
        </div>
    )
}
