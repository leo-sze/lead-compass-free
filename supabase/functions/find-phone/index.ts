import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface ContactInput {
  index: number;
  companyName: string;
  website?: string;
  city?: string;
  state?: string;
  existingPhone?: string;
}

interface ContactResult {
  index: number;
  phone: string | null;
  source: "site" | "places" | "existing" | null;
}

/** Normalize any phone string to +55DDDNUMBER format */
function normalizePhone(raw: string): string {
  // Strip everything except digits and leading +
  let digits = raw.replace(/[^\d]/g, "");

  // Remove country code 55 if present
  if (digits.startsWith("55") && digits.length >= 12) {
    digits = digits.slice(2);
  }

  // Must be 10 (fixo) or 11 (celular) digits: DDD + number
  if (digits.length < 10 || digits.length > 11) return "";

  return `+55${digits}`;
}

/** Validate Brazilian phone: DDD 11-99, correct digit count */
function isValidBrazilianPhone(digits: string): boolean {
  // digits should be just the national number without country code
  const clean = digits.replace(/[^\d]/g, "");
  
  // Remove country code if present
  let national = clean;
  if (national.startsWith("55") && national.length >= 12) {
    national = national.slice(2);
  }

  if (national.length < 10 || national.length > 11) return false;
  
  const ddd = parseInt(national.slice(0, 2));
  if (ddd < 11 || ddd > 99) return false;

  // If 11 digits, must start with 9 after DDD (mobile)
  if (national.length === 11 && national[2] !== "9") return false;

  return true;
}

/** Extract phones from tel: links and contact-related contexts */
function scrapePhoneFromHTML(html: string): string[] {
  const phones: string[] = [];

  // Remove <script> and <style> blocks
  const cleaned = html.replace(/<script[\s\S]*?<\/script>/gi, "")
                       .replace(/<style[\s\S]*?<\/style>/gi, "");

  // 1. Extract from tel: links (highest confidence)
  const telMatches = cleaned.matchAll(/href=["']tel:([^"']+)["']/gi);
  for (const m of telMatches) {
    const digits = m[1].replace(/[^\d+]/g, "");
    if (digits.length >= 8) phones.push(digits);
  }

  // 2. Extract from WhatsApp links
  const waMatches = cleaned.matchAll(/(?:wa\.me|whatsapp\.com\/send\?phone=|api\.whatsapp\.com\/send\?phone=)(\d+)/gi);
  for (const m of waMatches) {
    phones.push(m[1]);
  }

  // 3. Extract from data-phone or data-tel attributes
  const dataMatches = cleaned.matchAll(/data-(?:phone|tel|telefone)=["']([^"']+)["']/gi);
  for (const m of dataMatches) {
    const digits = m[1].replace(/[^\d+]/g, "");
    if (digits.length >= 8) phones.push(digits);
  }

  // 4. Search near contact keywords (telefone, contato, fone, whatsapp, ligue)
  const PHONE_REGEX = /(\+?55[\s\-.]?)?\(?\d{2}\)?[\s\-.]?9?\d{4}[\s\-.]?\d{4}/g;
  const KEYWORDS = /(?:telefone|tel(?:efone)?|fone|whatsapp|contato|ligue|ligar|atendimento|sac)[:\s]*(.{0,60})/gi;
  
  let kwMatch;
  while ((kwMatch = KEYWORDS.exec(cleaned)) !== null) {
    const context = kwMatch[0] + (cleaned.slice(kwMatch.index, kwMatch.index + 120) || "");
    // Remove HTML tags from context
    const textContext = context.replace(/<[^>]+>/g, " ");
    let phoneMatch;
    while ((phoneMatch = PHONE_REGEX.exec(textContext)) !== null) {
      phones.push(phoneMatch[0]);
    }
  }

  // 5. Search in footer sections
  const footerMatch = cleaned.match(/<footer[\s\S]*?<\/footer>/gi);
  if (footerMatch) {
    for (const footer of footerMatch) {
      const footerText = footer.replace(/<[^>]+>/g, " ");
      let phoneMatch;
      const footerPhoneRegex = /(\+?55[\s\-.]?)?\(?\d{2}\)?[\s\-.]?9?\d{4}[\s\-.]?\d{4}/g;
      while ((phoneMatch = footerPhoneRegex.exec(footerText)) !== null) {
        phones.push(phoneMatch[0]);
      }
    }
  }

  // Validate and deduplicate
  const validated: string[] = [];
  const seen = new Set<string>();
  for (const p of phones) {
    const normalized = normalizePhone(p);
    if (normalized && isValidBrazilianPhone(normalized) && !seen.has(normalized)) {
      seen.add(normalized);
      validated.push(normalized);
    }
  }

  return validated;
}

async function scrapePhoneFromSite(url: string): Promise<string | null> {
  try {
    let formatted = url.trim();
    if (!formatted.startsWith("http")) formatted = `https://${formatted}`;

    const res = await fetch(formatted, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LeadExtract/1.0)" },
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;

    const html = await res.text();
    const phones = scrapePhoneFromHTML(html);
    return phones.length > 0 ? phones[0] : null;
  } catch (e) {
    console.error(`Scrape error for ${url}:`, e);
  }
  return null;
}

async function findPhoneViaPlaces(companyName: string, city: string, state: string, apiKey: string): Promise<string | null> {
  const query = [companyName, city, state].filter(Boolean).join(" ");
  if (!query.trim()) return null;

  try {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.displayName,places.nationalPhoneNumber,places.internationalPhoneNumber",
      },
      body: JSON.stringify({ textQuery: query }),
    });

    if (!res.ok) {
      console.error(`Places API error for "${query}": ${res.status}`);
      return null;
    }

    const data = await res.json();
    const place = data.places?.[0];
    const raw = place?.internationalPhoneNumber || place?.nationalPhoneNumber;
    if (raw) {
      const normalized = normalizePhone(raw);
      if (normalized && isValidBrazilianPhone(normalized)) return normalized;
    }
  } catch (e) {
    console.error(`Places error for "${query}":`, e);
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { contacts } = await req.json() as { contacts: ContactInput[] };

    if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
      return new Response(
        JSON.stringify({ error: "contacts array is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: setting } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "google_places_api_key")
      .maybeSingle();

    const placesApiKey = setting?.value || "";

    const results: ContactResult[] = [];

    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];
      let phone: string | null = null;
      let source: ContactResult["source"] = null;

      // Stage 0: If existing phone provided, normalize and return
      if (contact.existingPhone) {
        const normalized = normalizePhone(contact.existingPhone);
        if (normalized && isValidBrazilianPhone(normalized)) {
          phone = normalized;
          source = "existing";
        }
      }

      // Stage 1: Google Places (verified numbers) — PRIMARY
      if (!phone && placesApiKey) {
        phone = await findPhoneViaPlaces(
          contact.companyName,
          contact.city || "",
          contact.state || "",
          placesApiKey
        );
        if (phone) source = "places";
      }

      // Stage 2: Scrape website — FALLBACK
      if (!phone && contact.website) {
        phone = await scrapePhoneFromSite(contact.website);
        if (phone) source = "site";
      }

      results.push({ index: contact.index, phone, source });

      if (i < contacts.length - 1) {
        await new Promise(r => setTimeout(r, 200));
      }
    }

    return new Response(
      JSON.stringify({ results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("find-phone error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
