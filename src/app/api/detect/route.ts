import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { url } = body;

  if (!url || typeof url !== 'string') {
    return NextResponse.json({ error: 'Missing or invalid URL' }, { status: 400 });
  }

  let validatedUrl: URL;
  try {
    validatedUrl = new URL(url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`);
  } catch (e) {
    return NextResponse.json({ error: 'Invalid URL format. Please include http:// or https:// or provide a valid domain.' }, { status: 400 });
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 seconds timeout

    const res = await fetch(validatedUrl.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36 StoreSleuthBot/1.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return NextResponse.json({ error: `Failed to fetch URL. Server responded with status: ${res.status} ${res.statusText}` }, { status: res.status });
    }

    const html = await res.text();
    const $ = cheerio.load(html);
    const lowerHtmlContent = html.toLowerCase(); // For case-insensitive general string checks
    
    // Salla Detection
    const isSallaByMeta = $('meta[name="generator"][content="salla"]').length > 0 || $('meta[name="generator"][content="Salla"]').length > 0;
    const isSallaByScript = lowerHtmlContent.includes('window.salla') || lowerHtmlContent.includes('salla.config') || lowerHtmlContent.includes("salla.app");
    const isSallaByCdn = lowerHtmlContent.includes('cdn.salla.sa');
    const hasSallaThemeAsset = lowerHtmlContent.includes('/assets/themes/salla');

    if (isSallaByMeta || isSallaByScript || isSallaByCdn || hasSallaThemeAsset) {
      let storeId = 'Unknown';
      
      // Try meta tags first
      const metaStoreId = $('meta[property="store:id"]').attr('content') || 
                          $('meta[name="store-id"]').attr('content') ||
                          $('salla-app').attr('store-id');
      if (metaStoreId && /^\d+$/.test(metaStoreId)) {
        storeId = metaStoreId;
      } else {
         // Try script content regex (more robust)
        const scriptIdMatches = [
          ...html.matchAll(/"store_id"\s*:\s*"?(\d+)"?/gi),
          ...html.matchAll(/salla\.config\.store\.id\s*=\s*"?(\d+)"?/gi),
          ...html.matchAll(/storeId["']?\s*:\s*["']?(\d+)["']?/gi), // More generic
          ...html.matchAll(/content=["']store_id=(\d+)["']/gi) // For some meta or link tags
        ];
        for (const match of scriptIdMatches) {
            if (match[1] && /^\d+$/.test(match[1])) {
                storeId = match[1];
                break;
            }
        }
      }
      return NextResponse.json({ platform: 'Salla', storeId });
    }

    // Zid Detection
    const isZidByMeta = $('meta[name="generator"][content="zid"]').length > 0 || $('meta[name="generator"][content="Zid"]').length > 0;
    const isZidByScript = lowerHtmlContent.includes('window.zid') || lowerHtmlContent.includes('window.__store__') || lowerHtmlContent.includes("zid.behaviors");
    const isZidByCdn = lowerHtmlContent.includes('cdn.zid.store') || lowerHtmlContent.includes('assets.zid.store');
    const hasZidElement = $('#zid-app').length > 0 || $('zid-app-entry').length > 0;
    
    if (isZidByMeta || isZidByScript || isZidByCdn || hasZidElement) {
      let storeId = 'Unknown';
      
      // Check window.__STORE__ from script tags
      $('script').each((_i, el) => {
        const scriptContent = $(el).html();
        if (scriptContent && scriptContent.toLowerCase().includes('window.__store__')) {
          const match = scriptContent.match(/window\.__STORE__\s*=\s*({.+?});/i);
          if (match && match[1]) {
            try {
              // Attempt to parse JSON, removing trailing commas if any
              const cleanedJsonString = match[1].replace(/,\s*([}\]])/g, '$1');
              const storeJson = JSON.parse(cleanedJsonString);
              if (storeJson && storeJson.id && /^\d+$/.test(String(storeJson.id))) {
                storeId = String(storeJson.id);
                return false; // Found ID, break loop
              }
            } catch (e) { 
              // Try regex on the string if JSON parse fails
              const idMatch = match[1].match(/"id"\s*:\s*"?(\d+)"?/i);
              if (idMatch && idMatch[1] && /^\d+$/.test(idMatch[1])) {
                storeId = idMatch[1];
                return false;
              }
            }
          }
        }
      });

      if (storeId === 'Unknown') {
        const scriptIdMatches = [
            ...html.matchAll(/"store_id"\s*:\s*"?(\d+)"?/gi),
            ...html.matchAll(/"merchant_id"\s*:\s*"?(\d+)"?/gi), // Zid sometimes uses merchant_id
            ...html.matchAll(/storeId["']?\s*:\s*["']?(\d+)["']?/gi)
        ];
        for (const match of scriptIdMatches) {
            if (match[1] && /^\d+$/.test(match[1])) {
                storeId = match[1];
                break;
            }
        }
      }
      return NextResponse.json({ platform: 'Zid', storeId });
    }

    return NextResponse.json({ platform: 'Unknown', storeId: null });
  } catch (err: any) {
    if (err.name === 'AbortError' || (err.cause && err.cause.code === 'UND_ERR_CONNECT_TIMEOUT')) {
      return NextResponse.json({ error: 'Request timed out while trying to fetch the store URL. The store might be slow or temporarily unavailable.' }, { status: 504 }); // Gateway Timeout
    }
    if (err.cause && (err.cause.code === 'ENOTFOUND' || err.cause.code === 'EAI_AGAIN')) {
      return NextResponse.json({ error: 'Could not resolve the store URL. Please check the domain name.' }, { status: 400 });
    }
    console.error("Store Detection Error:", err);
    return NextResponse.json({ error: 'Failed to analyze URL. The store might be protected, inaccessible, or the URL is incorrect.' }, { status: 500 });
  }
}
