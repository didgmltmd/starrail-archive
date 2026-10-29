import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { asset, game } from "../data/game";
import { useExcluded } from "../lib/excluded";
import type { OwnedCharacter } from "../types";
import "../styles/roster.css";

const ELEMENTS = ["Physical", "Fire", "Ice", "Thunder", "Wind", "Quantum", "Imaginary"];
const PATHS = ["Warrior", "Rogue", "Mage", "Shaman", "Warlock", "Knight", "Priest", "Memory", "Elation"];

export function RosterPage({
  characters,
  onOpen,
  allowExclude = false,
}: {
  characters: OwnedCharacter[];
  onOpen: (id: string) => void;
  /** Show the "don't build" toggle (only for my own roster) */
  allowExclude?: boolean;
}) {
  const { isExcluded, toggle } = useExcluded();
  const [element, setElement] = useState<string | null>(null);
  const [path, setPath] = useState<string | null>(null);

  const list = useMemo(
    () =>
      characters
        .filter((c) => !element || game.characters[c.id].element === element)
        .filter((c) => !path || game.characters[c.id].path === path)
        .sort(
          (a, b) =>
            game.characters[b.id].rarity - game.characters[a.id].rarity || b.level - a.level || a.id.localeCompare(b.id),
        ),
    [characters, element, path],
  );

  return (
    <div className="page roster-page">
      <div className="roster-filters">
        <div className="filter-group">
          {ELEMENTS.map((e) => (
            <button
              key={e}
              className={element === e ? "on" : ""}
              title={game.elements[e].name}
              onClick={() => setElement(element === e ? null : e)}
            >
              <img src={asset(game.elements[e].icon)} alt="" />
            </button>
          ))}
        </div>
        <div className="filter-group">
          {PATHS.map((p) => (
            <button
              key={p}
              className={path === p ? "on" : ""}
              title={game.paths[p].name}
              onClick={() => setPath(path === p ? null : p)}
            >
              <img src={asset(game.paths[p].icon)} alt="" />
            </button>
          ))}
        </div>
        <div className="roster-count num">
          {list.length}
          <span>/ {characters.length}</span>
        </div>
      </div>

      <div className="roster-grid">
        {list.map((c, i) => {
          const info = game.characters[c.id];
          const excluded = allowExclude && isExcluded(c.id);
          return (
            <motion.div
              key={c.id}
              role="button"
              tabIndex={0}
              className={`roster-card r${info.rarity} ${excluded ? "excluded" : ""}`}
              onClick={() => onOpen(c.id)}
              onKeyDown={(e) => e.key === "Enter" && onOpen(c.id)}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.02, 0.4), duration: 0.3 }}
              whileHover={{ y: -4 }}
            >
              <div className="card-art">
                <img src={asset(info.preview)} alt={info.name} loading="lazy" />
              </div>
              <img className="card-element" src={asset(game.elements[info.element].icon)} alt="" />
              {c.eidolon > 0 && <span className="card-eidolon num">E{c.eidolon}</span>}
              {excluded && <span className="card-excluded">육성 제외</span>}
              {allowExclude && (
                <button
                  className="card-exclude-btn"
                  title={excluded ? "다시 육성 대상으로" : "육성 안 함 (점검·파밍 계산에서 빼기)"}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(c.id);
                  }}
                >
                  {excluded ? "포함" : "제외"}
                </button>
              )}
              <div className="card-foot">
                <span className="card-name">{info.name}</span>
                <span className="card-lv num">Lv.{c.level}</span>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
