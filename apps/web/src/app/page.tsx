/**
 * Home page placeholder: proves the shell renders translated text. No product features yet.
 *
 * Module:   app shell (apps/web/src/app)
 * Serves:   FR-18 (all text through `translate`) · slice 01b
 */
import { translate } from "@/modules/shared";
import { getRequestLocale } from "@/lib/request-locale";

export default async function HomePage() {
  const locale = await getRequestLocale();
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-2 p-6">
      {/* `text-start` (not `text-left`) follows `dir`, so the same markup works in RTL. */}
      <h1 className="text-start text-2xl font-semibold">{translate(locale, "app.name")}</h1>
      <p className="text-muted-foreground text-start">{translate(locale, "home.placeholder")}</p>
    </main>
  );
}
