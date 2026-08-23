"use client";

import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { useState, useTransition } from "react";

import { type PointCarte } from "@/lib/carte";
import {
  CATEGORIES_LIEU,
  EMOJIS_CATEGORIE,
  estCategorieLieu,
  type CategorieLieu,
} from "@/lib/categories-lieu";
import { basculerFavoriLieu, basculerMasqueLieu, definirPositionLieu } from "../actions";
import { CarteDesLieux } from "../carte-client";
import { PositionInline } from "./position-inline";
import { Bouton, IconeCible, IconeOeilBarre, IconePlus, teinte } from "../ui";

/**
 * Choisir le lieu, puis confirmer — en deux gestes qui se voient.
 *
 * La zone se replie sur le lieu choisi : vingt lieux au catalogue faisaient de l'écran
 * un long couloir, et le dernier lieu utilisé est présélectionné — l'écran s'ouvre donc
 * déjà court, prêt à confirmer, jamais prêt à publier. C'est un `details` : sans
 * JavaScript, le repli s'ouvre au doigt et les boutons radio font le reste.
 *
 * Les favoris (l'étoile) tiennent la tête de liste : une famille sort toujours aux trois
 * mêmes endroits. L'étoile bascule sans recharger — un envoi de formulaire emporterait
 * les cercles décochés et le lieu choisi. Le masquage (l'œil barré) est son miroir : un
 * lieu qu'on ne fréquente pas sort de la liste, la puce « Masqués » le garde à portée
 * de retour.
 *
 * Rien ne part avant le bouton de confirmation, et lui seul.
 */

export type LieuChoix = {
  id: string;
  name: string;
  commune: string | null;
  address: string | null;
  categorie: string | null;
  lat: number | null;
  lon: number | null;
};

export function ChoixDuLieu({
  lieux,
  dernierLieuId,
  favorisInitiaux,
  masquesInitiaux,
  cleApi,
  mapId,
}: {
  lieux: LieuChoix[];
  /** Le lieu de la dernière sortie : présélectionné, jamais publié d'office. */
  dernierLieuId?: string | null;
  favorisInitiaux?: string[];
  masquesInitiaux?: string[];
  cleApi?: string | null;
  mapId?: string | null;
}) {
  const t = useTranslations("ChoixLieu");
  const tE = useTranslations("Etiquettes");
  const [choisi, setChoisi] = useState<string | null>(() => {
    if (!dernierLieuId) return null;
    const masque = new Set(masquesInitiaux ?? []).has(dernierLieuId);
    return !masque && lieux.some((l) => l.id === dernierLieuId) ? dernierLieuId : null;
  });
  const [ouvert, setOuvert] = useState(choisi === null);
  const [recherche, setRecherche] = useState("");
  const [filtre, setFiltre] = useState<CategorieLieu | null>(null);
  const [vueMasques, setVueMasques] = useState(false);
  const [favoris, setFavoris] = useState<Set<string>>(new Set(favorisInitiaux ?? []));
  const [masques, setMasques] = useState<Set<string>>(new Set(masquesInitiaux ?? []));
  /*
    Un seul panneau d'édition à la fois : poser le repère d'un lieu n'est pas un
    geste qu'on enchaîne, c'est un aller-retour. Ouvrir un panneau ferme l'autre,
    ce qui évite l'empilement des `<PositionInline>` qui chacun charge Google Maps.
   */
  const [panneauPositionPour, setPanneauPositionPour] = useState<string | null>(null);
  const [, lancer] = useTransition();

  const lieuChoisi = lieux.find((l) => l.id === choisi) ?? null;

  const basculerFavoriIci = (id: string) => {
    // L'étoile change tout de suite ; le serveur suit. Au pire d'un échec réseau, le
    // prochain chargement remettra la vérité de la base — un favori n'est pas une sortie.
    setFavoris((avant) => {
      const apres = new Set(avant);
      if (apres.has(id)) apres.delete(id);
      else apres.add(id);
      return apres;
    });
    lancer(() => basculerFavoriLieu(id));
  };

  const basculerMasqueIci = (id: string) => {
    const masquer = !masques.has(id);
    setMasques((avant) => {
      const apres = new Set(avant);
      if (masquer) apres.add(id);
      else apres.delete(id);
      return apres;
    });
    if (masquer) {
      // Miroir du serveur : masquer retire l'étoile, et un lieu choisi puis masqué
      // n'est plus choisi — on ne confirme pas une sortie vers un lieu qu'on vient
      // de ranger hors de sa vue.
      setFavoris((avant) => {
        const apres = new Set(avant);
        apres.delete(id);
        return apres;
      });
      if (choisi === id) setChoisi(null);
      // Ranger un lieu ferme son panneau d'édition : ce n'est plus un geste actif.
      setPanneauPositionPour((actuel) => (actuel === id ? null : actuel));
    }
    lancer(() => basculerMasqueLieu(id));
  };

  const basculerPanneauPosition = (id: string) => {
    setPanneauPositionPour((actuel) => (actuel === id ? null : id));
  };

  /*
    La recherche vit ici, au milieu des lieux qu'elle fouille — pas en haut de l'écran,
    dans un espace qui parlait d'autre chose. Elle filtre sur place, sans requête : les
    lieux sont déjà chargés, et un rechargement emporterait les cercles décochés.
    Tolérante aux accents, comme la déduplication du catalogue.
  */
  const normalise = (texte: string) =>
    texte
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase();
  const requete = normalise(recherche.trim());
  const correspond = (l: LieuChoix) =>
    requete === "" ||
    normalise(l.name).includes(requete) ||
    (l.commune ? normalise(l.commune).includes(requete) : false);

  const visibles = lieux.filter((l) => !masques.has(l.id) && correspond(l));
  const listeMasques = lieux.filter((l) => masques.has(l.id) && correspond(l));

  const categoriesPresentes = CATEGORIES_LIEU.filter((c) =>
    visibles.some((l) => l.categorie === c),
  );
  const filtres = filtre ? visibles.filter((l) => l.categorie === filtre) : visibles;
  /* Les favoris d'abord — dans l'ordre du nom, comme le reste : deux listes triées, pas
     un classement. Étoiler un lieu le fait monter sous les yeux : c'est le geste qui
     s'explique lui-même. La vue « Masqués » remplace tout : on y va pour réafficher. */
  const ordonnes = vueMasques
    ? listeMasques
    : [
        ...filtres.filter((l) => favoris.has(l.id)),
        ...filtres.filter((l) => !favoris.has(l.id)),
      ];

  const points = ordonnes.flatMap((lieu): PointCarte[] =>
    lieu.lat != null && lieu.lon != null
      ? [
          {
            id: lieu.id,
            nom: lieu.name,
            sousTitre: [lieu.address, lieu.commune].filter(Boolean).join(", "),
            lat: lieu.lat,
            lon: lieu.lon,
            href: `/lieux?q=${encodeURIComponent(lieu.name)}`,
          },
        ]
      : [],
  );

  return (
    <>
      <details
        open={ouvert}
        onToggle={(e) => setOuvert((e.target as HTMLDetailsElement).open)}
        className="mb-4"
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-[var(--radius-pilule)] bg-[color:var(--color-surface)] px-4 py-3 shadow-[inset_0_0_0_2px_var(--color-trait)]">
          <span className="min-w-0 truncate text-sm">
            {lieuChoisi ? (
              <>
                ✅{" "}
                <strong className="text-[color:var(--color-encre)]">{lieuChoisi.name}</strong>
                {lieuChoisi.commune ? (
                  <span className="text-[color:var(--color-doux)]"> · {lieuChoisi.commune}</span>
                ) : null}
              </>
            ) : (
              <strong>{t("choisirUnLieu")}</strong>
            )}
          </span>
          <span className="shrink-0 text-sm font-bold text-[color:var(--color-vert)]">
            {lieuChoisi ? t("changer") : t("ouvrir")}
          </span>
        </summary>

        <div className="mt-3 space-y-3">
          {/*
            Sans attribut `name`, le champ ne part pas avec le formulaire ; et Entrée y
            déclencherait l'envoi implicite — c'est-à-dire la sortie elle-même. On la
            neutralise : chercher un lieu ne publie rien.
          */}
          <input
            type="search"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.preventDefault();
            }}
            placeholder={t("chercherUnLieu")}
            aria-label={t("chercherUnLieu")}
            className="w-full rounded-[var(--radius-pilule)] bg-[color:var(--color-surface)] px-5 py-3 text-base ring-2 ring-[color:var(--color-trait)] outline-none focus:ring-[color:var(--color-vert)]"
          />

          {categoriesPresentes.length > 1 || listeMasques.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              <PuceFiltre
                actif={filtre === null && !vueMasques}
                onClick={() => {
                  setFiltre(null);
                  setVueMasques(false);
                }}
              >
                {t("tous")}
              </PuceFiltre>
              {categoriesPresentes.map((categorie) => (
                <PuceFiltre
                  key={categorie}
                  actif={filtre === categorie && !vueMasques}
                  onClick={() => {
                    setFiltre(filtre === categorie ? null : categorie);
                    setVueMasques(false);
                  }}
                >
                  {EMOJIS_CATEGORIE[categorie]} {tE(`categorie.${categorie}`)}
                </PuceFiltre>
              ))}
              {listeMasques.length > 0 ? (
                <PuceFiltre actif={vueMasques} onClick={() => setVueMasques(!vueMasques)}>
                  {t("masques", { n: listeMasques.length })}
                </PuceFiltre>
              ) : null}
            </div>
          ) : null}

          {/*
            La carte vit entre les filtres et la liste, pour deux raisons. La première,
            elle pèse lourd une fois déployée (chargement Google, quota, attention visuelle) :
            rester tout en bas laissait croire qu'on pouvait l'ignorer. En la rapprochant
            des puces, on dit « choisir un lieu, c'est aussi regarder où il est ». La
            seconde, elle répond aux mêmes filtres — catégorie, recherche — que la liste
            en dessous : la mettre au-dessus les lui transmet déjà, la mettre en dessous
            l'aurait forcée à refaire le tri. or, c'est la même liste qui parle, et la carte
            qui montre, et le parent qui hésite entre les deux.
          */}
          <CarteDesLieux
            points={points}
            sansPosition={ordonnes.length - points.length}
            cleApi={cleApi}
            mapId={mapId}
            choisiId={choisi}
            onChoisir={(point) => {
              setChoisi(point.id);
              setOuvert(false);
            }}
          />

          <ul className="space-y-3">
            {ordonnes.map((lieu) => (
              <li
                key={lieu.id}
                className={
                  panneauPositionPour === lieu.id
                    ? "space-y-2"
                    : "flex flex-wrap items-stretch gap-2"
                }
              >
                <div className="flex items-center justify-between gap-2">
                {/*
                  Le label prend sa largeur plafonnee (max-w-md) selon le nom du
                  lieu, sans depasser 28rem. Le bloc des 3 boutons est pousse
                  au bord droit par justify-between, sans ml-auto ni gap qui
                  ferait flotter les boutons au milieu de l'ecran.
                */}
                <label className="min-w-0 max-w-md">
                  <input
                    type="radio"
                    name="lieu"
                    value={lieu.id}
                    required
                    checked={choisi === lieu.id}
                    onChange={() => {
                      setChoisi(lieu.id);
                      setOuvert(false);
                    }}
                    className="peer sr-only"
                  />
                  {/*
                    L'accent de couleur vit en style inline (la teinte est calculée), donc
                    la mise en valeur du choix passe par `outline` : un box-shadow de
                    classe perdrait toujours contre le style inline.
                  */}
                  <span
                    className="flex h-full w-full cursor-pointer items-center gap-3 rounded-[var(--radius-carte)] bg-[color:var(--color-surface)] px-4 py-3 text-left transition-transform active:translate-y-[2px] peer-checked:outline peer-checked:outline-[3px] peer-checked:-outline-offset-[3px] peer-checked:outline-[color:var(--color-vert)] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[color:var(--color-bleu)]"
                    style={{
                      boxShadow: `inset 0 0 0 2px var(--color-${teinte(lieu.id)}-doux)`,
                    }}
                  >
                    <span
                      aria-hidden
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl"
                      style={{ background: `var(--color-${teinte(lieu.id)}-doux)` }}
                    >
                      {choisi === lieu.id
                        ? "✅"
                        : lieu.categorie && estCategorieLieu(lieu.categorie)
                          ? EMOJIS_CATEGORIE[lieu.categorie]
                          : "📍"}
                    </span>
                    <span className="min-w-0">
                      <span className="titre block font-bold leading-tight line-clamp-2 break-words">
                        {lieu.name}
                      </span>
                      {lieu.commune ? (
                        <span className="block truncate text-sm text-[color:var(--color-doux)]">
                          {lieu.commune}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </label>
                {vueMasques ? (
                  <button
                    type="button"
                    onClick={() => basculerMasqueIci(lieu.id)}
                    className="shrink-0 rounded-[var(--radius-carte)] px-3 text-sm font-bold text-[color:var(--color-vert)] shadow-[inset_0_0_0_2px_var(--color-trait)]"
                  >
                    {t("reafficher")}
                  </button>
                ) : (
                  <span className="flex w-28 shrink-0 flex-col gap-1">
                    {/*
                      Trois gestes, deux lignes : étoile (favori) et cible (situer)
                      se partagent la première ligne, l'œil barré (masquer) tient
                      la seconde. La cible suit le même rythme que l'étoile : les
                      deux sont des rappels (mémoriser pour plus tard, repérer pour
                      voir où), l'œil est un rangement (sortir du chemin). Le bloc
                      entier est figé à `w-28` (7rem) pour que sa largeur ne varie
                      jamais, et `ml-auto` le colle au bord droit du conteneur,
                      l'écartant du texte sur les écrans larges.
                    */}
                    <span className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => basculerFavoriIci(lieu.id)}
                        aria-label={
                          favoris.has(lieu.id)
                            ? t("retirerDesFavoris", { nom: lieu.name })
                            : t("mettreEnFavori", { nom: lieu.name })
                        }
                        className="flex-1 rounded-[var(--radius-carte)] px-3 text-lg shadow-[inset_0_0_0_2px_var(--color-trait)]"
                      >
                        {favoris.has(lieu.id) ? "⭐" : "☆"}
                      </button>
                      <button
                        type="button"
                        onClick={() => basculerPanneauPosition(lieu.id)}
                        aria-label={t("situerAria", { nom: lieu.name })}
                        title={t("situer")}
                        className="flex-1 rounded-[var(--radius-carte)] px-3 text-lg shadow-[inset_0_0_0_2px_var(--color-trait)]"
                        style={
                          lieu.lat != null && lieu.lon != null
                            ? undefined
                            : { color: "var(--color-doux)" }
                        }
                      >
                        {/* La cible prend la couleur du lieu quand il est situé,
                            discrète tant qu'il ne l'est pas. */}
                        <IconeCible
                          className="mx-auto h-5 w-5"
                          rempli={lieu.lat != null && lieu.lon != null}
                        />
                      </button>
                    </span>
                    <button
                      type="button"
                      onClick={() => basculerMasqueIci(lieu.id)}
                      aria-label={t("masquerDeLaListe", { nom: lieu.name })}
                      className="flex flex-1 items-center justify-center rounded-[var(--radius-carte)] px-3 text-[color:var(--color-doux)] shadow-[inset_0_0_0_2px_var(--color-trait)]"
                    >
                      <IconeOeilBarre className="h-5 w-5" />
                    </button>
                  </span>
                )}
                </div>
                {/*
                  Le panneau d'édition vit sous la ligne du lieu, pas à côté : à
                  côté il pousserait les autres lieux hors de l'écran, et le clic
                  latéral dans une liste dense est une erreur classique. Ici, il
                  apparaît quand on a explicitement cliqué sur la cible, et
                  disparaît dès qu'on enregistre, annule, ou qu'on rouvre la liste.
                */}
                {panneauPositionPour === lieu.id ? (
                  <PositionInline
                    initialLat={lieu.lat}
                    initialLon={lieu.lon}
                    cleApi={cleApi}
                    mapId={mapId}
                    onSave={(lat, lon) => {
                      lancer(async () => {
                        await definirPositionLieu(lieu.id, lat, lon);
                        setPanneauPositionPour(null);
                      });
                    }}
                    onCancel={() => setPanneauPositionPour(null)}
                  />
                ) : null}
              </li>
            ))}
          </ul>

          {vueMasques && listeMasques.length === 0 ? (
            <p className="text-sm leading-snug text-[color:var(--color-doux)]">
              {t("aucunLieuMasque")}
            </p>
          ) : null}

          {!vueMasques && ordonnes.length === 0 && requete !== "" ? (
            <p className="text-sm leading-snug text-[color:var(--color-doux)]">
              {t("aucunLieuDeCeNom")}
            </p>
          ) : null}

          <p className="flex flex-wrap gap-x-5 gap-y-1">
            <Link
              href="/sortir/lieu"
              className="inline-flex items-center gap-1 font-bold text-[color:var(--color-vert)] underline underline-offset-4"
            >
              <IconePlus className="h-5 w-5" />
              {t("lieuPasDansListe")}
            </Link>
            <Link
              href="/lieux"
              className="text-sm text-[color:var(--color-doux)] underline underline-offset-4"
            >
              {t("corrigerUnLieu")}
            </Link>
          </p>

          </div>
        </details>

        <div>
          <Bouton>{t("confirmerLaSortie")}</Bouton>
          <p className="mt-2 text-center text-sm leading-snug text-[color:var(--color-doux)]">
          {lieuChoisi
            ? t.rich("confirmationDetail", {
                strong: (chunks) => <strong>{chunks}</strong>,
              })
            : t("choisirDabordUnLieu")}
        </p>
      </div>
    </>
  );
}

function PuceFiltre({
  actif,
  onClick,
  children,
}: {
  actif: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 rounded-[var(--radius-pilule)] px-4 py-2 text-sm font-bold"
      style={
        actif
          ? { background: "var(--color-vert)", color: "var(--color-fond)" }
          : {
              background: "var(--color-surface)",
              color: "var(--color-doux)",
              boxShadow: "inset 0 0 0 2px var(--color-trait)",
            }
      }
    >
      {children}
    </button>
  );
}
