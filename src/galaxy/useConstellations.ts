import { useEffect } from "react";
import { useAtlas } from "../atlas/context";
import { FX, grantConstellations, litUnits } from "../store/game";
import { useStore } from "../store/store";
import { toast } from "../ui/Toast";

/** 一个单元的词全部点亮 → 连成星座，送一个星图特效，并提示一下。在 Shell 里挂一次。 */
export function useConstellations() {
  const atlas = useAtlas();
  const cards = useStore((s) => s.progress.cards);
  const formed = useStore((s) => s.progress.game.constellations);
  useEffect(() => {
    const fresh = litUnits(atlas, { cards }).filter((u) => !formed.includes(u.key));
    if (!fresh.length) return;
    const gifts = grantConstellations(fresh);
    if (!gifts.length) return;
    const names = gifts.map((g) => g.name).join("、");
    const fx = gifts.flatMap((g) => (g.fx ? [`「${FX.find((m) => m.id === g.fx)?.name}」`] : []));
    const shards = gifts.reduce((n, g) => n + (g.shards ?? 0), 0);
    const reward = [fx.length ? `星图特效${fx.join("")}` : "", shards ? `${shards} 个碎片（特效已经集齐）` : ""].filter(Boolean).join("，还有 ");
    toast(`${names} 的星连成了星座！送你${reward}，去星图看看吧。`, "ok");
  }, [atlas, cards, formed]);
}
