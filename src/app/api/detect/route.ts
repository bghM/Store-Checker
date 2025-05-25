
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
      
      // Priority Order for Salla ID:
      // 1. Specific Meta Tags
      const metaStoreIdCandidates = [
        $('meta[property="store:id"]').attr('content'),
        $('meta[name="store-id"]').attr('content'),
        $('meta[name="salla:store:id"]').attr('content'),
      ];
      for (const id of metaStoreIdCandidates) {
        if (id && /^\d+$/.test(id)) {
          storeId = id;
          break;
        }
      }

      // 2. Specific HTML Element Attributes
      if (storeId === 'Unknown') {
        const elementAttrCandidates = [
          $('salla-app').attr('store-id'),
          $('salla-apps').attr('store'), // Common attribute for store ID
        ];
        for (const id of elementAttrCandidates) {
          if (id && /^\d+$/.test(id)) {
            storeId = id;
            break;
          }
        }
      }
      
      // 3. Script Content Regex (global vars, config objects, dataLayer)
      if (storeId === 'Unknown') {
        const sallaScriptRegexes = [
          /salla\.config\.store\.id\s*=\s*"?(\d+)"?/i,
          /Salla\.Store\.id\s*=\s*"?(\d+)"?/i,
          /appManager\.getState\(\)\.store\.id\s*:\s*"?(\d+)"?/i,
          /"store_id"\s*:\s*"?(\d+)"?/gi, // General JSON-like
          /storeId["']?\s*:\s*["']?(\d+)["']?/gi, // General variable assignment
          /sallaTagManager\.dataLayer\.push\(\s*\{\s*[^}]*?"store_id":\s*"(\d+)"/i,
          // More generic search for store_id in JSON structures within scripts
          /(?:salla\.config\.store|Salla\.storeData)\s*=\s*\{[^{}]*?"id"\s*:\s*"?(\d+)"?/i, 
          /window\.__INITIAL_STATE__\s*=\s*\{[^{}]*?store\s*:\s*\{[^{}]*?id\s*:\s*(\d+)/i,
          /salla\.event\.dispatchEvents\(\s*\{[^}]*?"twilight::init"\s*:\s*\{[^}]*?"store"\s*:\s*\{[^}]*?"id"\s*:\s*"?(\d+)"?[^}]*?\}\s*\}\s*\}\s*\)/i
        ];
        
        $('script').each((_i, el) => {
          const scriptContent = $(el).html();
          if (scriptContent) {
            for (const regex of sallaScriptRegexes) {
              const matches = (regex.global) ? [...scriptContent.matchAll(regex)] : [scriptContent.match(regex)];
              for (const match of matches) {
                if (match && match[1] && /^\d+$/.test(match[1])) {
                  storeId = match[1];
                  return false; // Break from script iteration
                }
              }
            }
          }
          if (storeId !== 'Unknown') return false; // Break from .each if found
        });
      }

      // 4. Generic data-store-id attribute on any element
      if (storeId === 'Unknown') {
        $('[data-store-id]').each((_i, el) => {
          const id = $(el).attr('data-store-id');
          if (id && /^\d+$/.test(id)) {
            storeId = id;
            return false; // Break .each
          }
        });
      }
      
      return NextResponse.json({ platform: 'Salla', storeId: storeId === 'Unknown' ? null : storeId });
    }

    // Zid Detection
    const isZidByMeta = $('meta[name="generator"][content="zid"]').length > 0 || $('meta[name="generator"][content="Zid"]').length > 0;
    const isZidByScript = lowerHtmlContent.includes('window.zid') || lowerHtmlContent.includes('window.__store__') || lowerHtmlContent.includes("zid.behaviors");
    const isZidByCdn = lowerHtmlContent.includes('cdn.zid.store') || lowerHtmlContent.includes('assets.zid.store');
    const hasZidElement = $('#zid-app').length > 0 || $('zid-app-entry').length > 0;
    
    if (isZidByMeta || isZidByScript || isZidByCdn || hasZidElement) {
      let storeId = 'Unknown';
      
      // Priority Order for Zid ID:
      // 1. window.__STORE__ from script tags (most reliable if present)
      $('script').each((_i, el) => {
        const scriptContent = $(el).html();
        if (scriptContent && scriptContent.toLowerCase().includes('window.__store__')) {
          const match = scriptContent.match(/window\.__STORE__\s*=\s*({.+?});/i);
          if (match && match[1]) {
            try {
              const cleanedJsonString = match[1].replace(/,\s*([}\]])/g, '$1').replace(/;\s*$/, '');
              const storeJson = JSON.parse(cleanedJsonString);
              if (storeJson && storeJson.id && /^\d+$/.test(String(storeJson.id))) {
                storeId = String(storeJson.id);
                return false; 
              }
               if (storeJson && storeJson.store && storeJson.store.id && /^\d+$/.test(String(storeJson.store.id))) {
                storeId = String(storeJson.store.id);
                return false;
              }
            } catch (e) { 
              const idMatch = match[1].match(/"id"\s*:\s*"?(\d+)"?/i);
              if (idMatch && idMatch[1] && /^\d+$/.test(idMatch[1])) {
                storeId = idMatch[1];
                return false;
              }
            }
          }
        }
      });

      // 2. Script Content Regex (global vars, config objects)
      if (storeId === 'Unknown') {
        const zidScriptRegexes = [
          /ZID_STORE_ID\s*=\s*['"]?(\d+)['"]?/i,
          /zidApi\.store\.id\s*=\s*"?(\d+)"?/i,
          /zid\.store\.id\s*=\s*['"]?(\d+)['"]?/i,
          /window\.zid\.store\s*=\s*\{[^{}]*?"id"\s*:\s*"?(\d+)"?/i,
          /"store_id"\s*:\s*"?(\d+)"?/gi, // General JSON-like
          /"merchant_id"\s*:\s*"?(\d+)"?/gi, // Zid sometimes uses merchant_id
          /storeId["']?\s*:\s*["']?(\d+)["']?/gi, // General variable assignment
        ];

        $('script').each((_i, el) => {
          const scriptContent = $(el).html();
          if (scriptContent) {
            for (const regex of zidScriptRegexes) {
               const matches = (regex.global) ? [...scriptContent.matchAll(regex)] : [scriptContent.match(regex)];
               for (const match of matches) {
                if (match && match[1] && /^\d+$/.test(match[1])) {
                  storeId = match[1];
                  return false; // Break from script iteration
                }
              }
            }
          }
          if (storeId !== 'Unknown') return false; // Break from .each if found
        });
      }

      // 3. Specific Meta Tags
      if (storeId === 'Unknown') {
        const metaStoreIdCandidates = [
          $('meta[name="store_id"]').attr('content'),
          $('meta[name="merchant_id"]').attr('content'),
        ];
        for (const id of metaStoreIdCandidates) {
          if (id && /^\d+$/.test(id)) {
            storeId = id;
            break;
          }
        }
      }
      if (storeId === 'Unknown') {
        const zidConfigMeta = $('meta[name="zid-config"]').attr('content');
        if (zidConfigMeta) {
            try {
                const configJson = JSON.parse(zidConfigMeta);
                if (configJson && configJson.store_id && /^\d+$/.test(String(configJson.store_id))) {
                    storeId = String(configJson.store_id);
                }
            } catch (e) { /* ignore parse error */ }
        }
      }

      // 4. Generic data-store-id or data-zid-store-id attribute
      if (storeId === 'Unknown') {
        $('[data-store-id], [data-zid-store-id]').each((_i, el) => {
          const id = $(el).attr('data-store-id') || $(el).attr('data-zid-store-id');
          if (id && /^\d+$/.test(id)) {
            storeId = id;
            return false; // Break .each
          }
        });
      }
      
      return NextResponse.json({ platform: 'Zid', storeId: storeId === 'Unknown' ? null : storeId });
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
