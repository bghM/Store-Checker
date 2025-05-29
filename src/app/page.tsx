'use client';
import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, SearchCode, SearchCheck, AlertTriangle } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { cn } from '@/lib/utils';
import Image from 'next/image';

interface DetectionResult {
  platform: string;
  storeId: string | null;
  error?: string;
}

export default function HomePage() {
  const [url, setUrl] = useState('');
  const [detectionResult, setDetectionResult] = useState<DetectionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const isValidUrl = (urlString: string): boolean => {
    try {
      const newUrl = new URL(urlString.startsWith('http://') || urlString.startsWith('https://') ? urlString : `https://${urlString}`);
      return newUrl.protocol === "http:" || newUrl.protocol === "https:";
    } catch (e) {
      return false;
    }
  };

  const handleCheck = async () => {
    if (!url.trim()) {
      toast({
        title: "Input Error",
        description: "Please enter a store URL.",
        variant: "destructive",
      });
      return;
    }

    const trimmedUrl = url.trim();
    if (!isValidUrl(trimmedUrl)) {
      toast({
        title: "Invalid URL",
        description: "Please enter a valid store URL (e.g., example.com or https://example.com).",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    setDetectionResult(null);

    try {
      const response = await fetch('/api/detect', {
        method: 'POST',
        body: JSON.stringify({ url: trimmedUrl }),
        headers: { 'Content-Type': 'application/json' },
      });
      const data: DetectionResult = await response.json();

      if (!response.ok) {
        setDetectionResult({ platform: 'Error', storeId: null, error: data.error || `Request failed: ${response.statusText || response.status}` });
      } else if (data.error) {
        setDetectionResult({ platform: 'Error', storeId: null, error: data.error });
      } else {
        setDetectionResult(data);
      }
    } catch (err: any) {
      console.error("API call failed:", err);
      setDetectionResult({ platform: 'Error', storeId: null, error: 'An unexpected error occurred. Please check your network connection and try again.' });
    }
    setLoading(false);
  };

  const renderResult = () => {
    if (!detectionResult) return null;

    if (detectionResult.error) {
      return (
        <Alert variant="destructive" className="mt-6 shadow-md">
          <AlertTriangle className="h-5 w-5" />
          <AlertTitle>Detection Failed</AlertTitle>
          <AlertDescription>{detectionResult.error}</AlertDescription>
        </Alert>
      );
    }

    if (detectionResult.platform !== 'Unknown') {
      return (
        <Alert variant="default" className="mt-6 bg-accent/20 border-accent shadow-md">
          <SearchCheck className="h-5 w-5 text-primary" />
          <AlertTitle className="font-semibold text-lg">Detection Successful!</AlertTitle>
          <AlertDescription className="text-foreground/80">
            This store appears to be built using{' '}
            <strong className={
              detectionResult.platform === 'Salla'
                ? 'text-[rgb(0_73_86/var(--tw-text-opacity,1))]'
                : detectionResult.platform === 'Zid'
                  ? 'text-[rgb(60,28,84)]'
                  : 'text-primary'
            }>
              {detectionResult.platform}
            </strong>.
            {detectionResult.platform === 'Zid' && (
              <div className="mt-2">
                <Image
                  src="/zid-icon.png"
                  alt="Zid Icon"
                  width={100}
                  height={100}
                  className="inline-block"
                />
              </div>
            )}
            {detectionResult.platform !== 'Zid' && detectionResult.storeId && (
              <>
                <br />
                Store ID: <strong className="text-primary">{detectionResult.storeId}</strong>
                {detectionResult.platform === 'Salla' && (
                  <div className="mt-2">
                    <Image
                      src="/salla-icon.png"
                      alt="Salla Icon"
                      width={100}
                      height={100}
                      className="inline-block"
                    />
                  </div>
                )}
              </>
            )}
          </AlertDescription>
        </Alert>
      );
    } else {
      return (
        <Alert variant="default" className="mt-6 shadow-md">
          <SearchCode className="h-5 w-5" />
          <AlertTitle className="text-lg">Platform Not Recognized</AlertTitle>
          <AlertDescription className="text-foreground/80">
            We could not definitively identify the platform for this store. It might use a custom solution or a platform not yet supported.
          </AlertDescription>
        </Alert>
      );
    }
  };

  const hasUrl = url.trim() !== '';

  return (
    <main className="min-h-screen bg-background flex flex-col items-center justify-center p-4 selection:bg-primary/20 selection:text-primary font-sans">
      <Card className="w-full max-w-lg shadow-2xl rounded-xl overflow-hidden border-2 border-primary/10">
        <CardHeader className="bg-card-header-custom p-6 md:p-8">
          <div className="flex items-center justify-center mb-3">
            <SearchCheck className="h-12 w-12 md:h-16 md:w-16 text-primary-foreground drop-shadow-lg" />
          </div>
          <CardTitle className="text-3xl md:text-4xl font-extrabold text-center text-primary-foreground tracking-tight drop-shadow-sm">
            Store Checker
          </CardTitle>
          <CardDescription className="text-center text-primary-foreground/80 pt-1 text-sm md:text-base">
            Uncover the platform behind e-commerce stores.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 md:p-8 space-y-6">
          <div className="space-y-2">
            <label htmlFor="store-url" className="text-sm font-medium text-foreground/90 block mb-1">Store URL</label>
            <Input
              id="store-url"
              type="url"
              className="h-12 text-base border-border focus:ring-2 focus:ring-primary/80 focus:border-primary transition-shadow duration-200 shadow-sm hover:shadow-md"
              placeholder="e.g., mystore.salla.sa"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !loading) handleCheck(); }}
              disabled={loading}
              aria-label="Enter store URL"
            />
          </div>

          <Button
            onClick={handleCheck}
            disabled={loading || !isClient}
            className={cn(
              "w-full h-12 text-md font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-300 ease-in-out transform hover:scale-[1.02] focus:ring-4",
              hasUrl && !loading
                ? "bg-card-header-custom hover:bg-card-header-custom/80 text-white focus:ring-card-header-custom/50"
                : "bg-primary hover:bg-primary/80 text-primary-foreground focus:ring-primary/50"
            )}
            aria-label="Check store platform"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Sleuthing...
              </>
            ) : (
              <>
                <SearchCode className="mr-2 h-5 w-5" />
                Check Platform
              </>
            )}
          </Button>

          {isClient && renderResult()}

        </CardContent>
        <CardFooter className="p-4 md:p-6 bg-secondary/20 border-t border-border/30">
          <p className="text-xs text-muted-foreground text-center w-full">
            Enter a full store URL (e.g., `https://example.com`). Analysis is based on publicly available HTML content.
          </p>
        </CardFooter>
      </Card>
      <footer className="mt-8 text-center text-sm text-muted-foreground">
        &copy; {new Date().getFullYear()} Store Checker. For informational purposes.
      </footer>
    </main>
  );
}
