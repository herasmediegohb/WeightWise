import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { normalizeBarcode, parseOffProduct } from "@/lib/barcode";
import { assertAuthed } from "@/lib/session";

export const maxDuration = 20;

const FOUND_TTL = 30 * 86_400_000;
const MISSING_TTL = 86_400_000;

/** Looks a barcode up in Open Food Facts, caching results in the database. */
export async function GET(req: Request) {
  try {
    await assertAuthed();
  } catch {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const code = normalizeBarcode(new URL(req.url).searchParams.get("code") ?? "");
  if (!code) return NextResponse.json({ error: "That isn't a valid barcode number." }, { status: 400 });

  const db = await getDb();
  const [cached] = await db.select().from(schema.barcodeProducts).where(eq(schema.barcodeProducts.code, code)).limit(1);
  if (cached) {
    const age = Date.now() - cached.fetchedAt.getTime();
    if (age < (cached.product ? FOUND_TTL : MISSING_TTL)) {
      return NextResponse.json({ product: cached.product });
    }
  }

  let product = null;
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,product_name_en,generic_name,brands,serving_size,serving_quantity,serving_quantity_unit,nutriments`,
      {
        // Open Food Facts asks apps to identify themselves. No personal details.
        headers: { "User-Agent": "WeightWise/1.0 (personal nutrition tracker)" },
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
      },
    );
    if (res.status !== 404 && !res.ok) throw new Error(`Open Food Facts returned ${res.status}`);
    const json = res.ok ? ((await res.json()) as { status?: number; product?: Parameters<typeof parseOffProduct>[1] }) : null;
    product = json?.status === 1 ? parseOffProduct(code, json.product) : null;
  } catch (err) {
    console.error("[barcode]", err);
    if (cached) return NextResponse.json({ product: cached.product });
    return NextResponse.json(
      { error: "Couldn't reach the food database. Check your connection and try again." },
      { status: 502 },
    );
  }

  await db
    .insert(schema.barcodeProducts)
    .values({ code, product, fetchedAt: new Date() })
    .onConflictDoUpdate({ target: schema.barcodeProducts.code, set: { product, fetchedAt: new Date() } });
  return NextResponse.json({ product });
}
