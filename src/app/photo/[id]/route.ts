import { lirePhoto } from "@/lib/photos";

/**
 * La photo d'une activité, servie telle qu'elle est en base.
 *
 * Hors du segment de langue : une image n'a pas de langue, et lui donner cinq adresses
 * ferait cinq entrées de cache pour les mêmes octets. `src/proxy.ts` l'exclut donc du
 * routeur de langues, comme `/icon` et `/badge`.
 *
 * Publique, parce que la fiche d'activité l'est : l'agenda du canton se lit sans compte.
 * Ce qui est privé, c'est l'inscription d'une famille, jamais l'activité elle-même.
 */
export async function GET(
  requete: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Le segment vient de l'URL : sans ce contrôle, `/photo/'` partirait en base.
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response(null, { status: 404 });

  const photo = await lirePhoto(id);
  if (!photo) return new Response(null, { status: 404 });

  /*
    L'entité de validation, c'est la date de la photo. Une photo remplacée en change, et le
    navigateur redemande ; sinon il garde la sienne et le serveur répond 304 sans relire les
    octets. Le guillemet fait partie de la syntaxe de l'en-tête, pas de la valeur.
  */
  const etag = `"${photo.updatedAt.getTime()}"`;
  const cache = "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800";

  if (requete.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": cache } });
  }

  return new Response(new Uint8Array(photo.contenu), {
    headers: {
      "Content-Type": photo.mime,
      "Content-Length": String(photo.octets),
      "Cache-Control": cache,
      ETag: etag,
      // Servie depuis notre domaine, donc soumise à notre politique de sécurité ; ce
      // second verrou interdit qu'un octet mal deviné soit traité comme autre chose.
      "X-Content-Type-Options": "nosniff",
    },
  });
}
