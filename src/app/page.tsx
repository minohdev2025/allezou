import { redirect } from "next/navigation";

import { currentAccount } from "@/lib/session";

export default async function Accueil() {
  const account = await currentAccount();
  redirect(account ? "/maintenant" : "/connexion");
}
