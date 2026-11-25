import { render } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { Engine } from "../engine/engine";
import { GAME_MANIFESTS, loadGame, resolveGameId } from "../games/manifest";
import { dayKey, dayTotal, emptyStats, streak, type PlayStats } from "../focus/guard";
import { loadStats, STATS_KEY } from "../focus/stats";
import { loadHighScores, loadLastPlayed } from "../shared/storage";
import { exportBackup, importBackup, wipeEverything } from "../settings/data";
import {
  CATEGORIES,
  GAME_ACTIONS,
  SETTINGS_BY_ID,
  SETTINGS_SCHEMA,
  SITES,
  validValue,
  type Category,
  type GameId,
  type InterludeSettings,
  type SettingDefinition,
  type SettingValue,
  type SiteId,
} from "../settings/schema";
import {
  loadSettingsDocument,
  resetSettings,
  resolveSettings,
  saveSettings,
  SETTINGS_KEY,
  type SettingsDocument,
} from "../settings/store";

type Profile = "global" | SiteId;
type Page = Category | "Diagnostics";
type Status = { message: string; error?: boolean };
const equals = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const has = (value: object | undefined, key: string): boolean =>
  !!value && Object.hasOwn(value, key);
const profileSite = (profile: Profile): SiteId | undefined =>
  profile === "global" ? undefined : profile;
const definitionsFor = (category: Category): SettingDefinition[] =>
  category === "Sites"
    ? ["enabled", "placement", "delayMs"].map((id) => SETTINGS_BY_ID.get(id)!)
    : SETTINGS_SCHEMA.filter((s) => s.category === category);

function Preview({ settings }: { settings: InterludeSettings }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<Engine | null>(null);
  const currentSettings = useRef(settings);
  const started = useRef(false);
  const [last, setLast] = useState<string | undefined>();
  const [error, setError] = useState("");
  const available = GAME_MANIFESTS.filter(
    (game) => settings[`game.${game.id}.enabled`] !== false,
  ).map((game) => game.id);
  let chosen = "";
  try {
    chosen = resolveGameId(settings.game, last, () => 0, available);
  } catch {
    /* all disabled */
  }
  useEffect(() => {
    void loadLastPlayed().then(setLast);
  }, []);
  useEffect(() => {
    if (!canvas.current) return;
    const target = canvas.current;
    const machine = new Engine(target, {
      settings: currentSettings.current,
      highScore: 0,
      preview: true,
      onStateChange: (state) => {
        target.dataset.scene = state;
      },
    });
    engine.current = machine;
    const focus = () => {
      target.focus({ preventScroll: true });
      machine.setFocused(true);
    };
    const blur = () => machine.setFocused(false);
    const visibility = () => machine.setTabHidden(document.hidden);
    target.addEventListener("pointerdown", focus);
    target.addEventListener("focus", focus);
    target.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", visibility);
    machine.attachInput(target);
    return () => {
      target.removeEventListener("pointerdown", focus);
      target.removeEventListener("focus", focus);
      target.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", visibility);
      machine.destroy();
      engine.current = null;
      started.current = false;
    };
  }, []);
  useEffect(() => {
    currentSettings.current = settings;
    engine.current?.setSettings(settings);
    if (chosen && engine.current) {
      const keys: Record<string, string> = {};
      for (const action of GAME_ACTIONS[chosen as GameId] ?? []) {
        const value = settings[`key.${chosen}.${action}`];
        if (typeof value === "string") keys[action] = value;
      }
      engine.current.input.setKeymapOverrides(keys);
    }
  }, [settings, chosen]);
  useEffect(() => {
    const machine = engine.current;
    if (!machine) return;
    let cancelled = false;
    if (!chosen) {
      machine.stop();
      started.current = false;
      setError("NO GAMES ENABLED");
      return;
    }
    setError("");
    void Promise.all([loadGame(chosen), loadHighScores()])
      .then(([game, scores]) => {
        if (cancelled) return;
        if (canvas.current) canvas.current.dataset.game = game.manifest.id;
        machine.setGame(game, scores[chosen] ?? 0);
        const keys: Record<string, string> = {};
        for (const action of GAME_ACTIONS[chosen as GameId] ?? []) {
          const value = currentSettings.current[`key.${chosen}.${action}`];
          if (typeof value === "string") keys[action] = value;
        }
        machine.input.setKeymapOverrides(keys);
        if (!started.current) {
          machine.start();
          started.current = true;
        }
      })
      .catch(() => setError("PREVIEW UNAVAILABLE"));
    return () => {
      cancelled = true;
    };
  }, [chosen]);
  const name = GAME_MANIFESTS.find((game) => game.id === chosen)?.name ?? "NO GAME";
  return (
    <aside class="preview" aria-label="Live game preview">
      <div class="preview-title">
        LIVE PREVIEW <span>{name}</span>
      </div>
      <canvas
        ref={canvas}
        tabIndex={0}
        aria-label={`Preview ${name}. Click to focus, then play.`}
        hidden={!!error}
      />
      {error && <div class="preview-note">{error}</div>}
      <div class="preview-foot">
        CLICK TO FOCUS · USE GAME KEYS
        <br />
        PREVIEW RUNS DO NOT SAVE SCORES
      </div>
    </aside>
  );
}

function SettingsControl({
  definition: d,
  value,
  disabled,
  change,
  conflict,
}: {
  definition: SettingDefinition;
  value: SettingValue;
  disabled: boolean;
  change: (value: SettingValue) => void;
  conflict: (code: string) => string | null;
}) {
  if (d.type === "boolean")
    return (
      <input
        id={d.id}
        type="checkbox"
        checked={value === true}
        disabled={disabled}
        onChange={(event) => change(event.currentTarget.checked)}
      />
    );
  if (d.type === "enum")
    return (
      <select
        id={d.id}
        value={String(value)}
        disabled={disabled}
        onChange={(event) => change(event.currentTarget.value)}
      >
        {d.options?.map((option) => (
          <option value={option.value} key={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  if (d.type === "number")
    return (
      <input
        id={d.id}
        type="number"
        min={d.min}
        max={d.max}
        step={d.step}
        value={String(value)}
        disabled={disabled}
        onChange={(event) => change(Number(event.currentTarget.value))}
      />
    );
  if (d.type === "keybinding")
    return (
      <input
        id={d.id}
        type="text"
        readOnly
        value={String(value)}
        disabled={disabled}
        aria-label={`${d.label}: press a key`}
        onKeyDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (d.binding) {
            const code = event.code;
            const message = conflict(code);
            if (message) return;
            change(code);
          } else {
            const key = event.key.toUpperCase();
            if (!/^[A-Z0-9]$/.test(key) || !(event.altKey || event.ctrlKey || event.metaKey)) {
              conflict("");
              return;
            }
            const parts = [
              event.ctrlKey && "Ctrl",
              event.altKey && "Alt",
              event.shiftKey && "Shift",
              event.metaKey && "Meta",
              key,
            ].filter(Boolean);
            change(parts.join("+"));
          }
        }}
      />
    );
  if (d.type === "list" && d.listOptions)
    return (
      <fieldset id={d.id} disabled={disabled} aria-label={d.label}>
        {d.listOptions.map((item) => (
          <label key={item}>
            <input
              type="checkbox"
              checked={Array.isArray(value) && value.includes(item)}
              onChange={(event) => {
                const current = Array.isArray(value) ? value : [];
                change(
                  event.currentTarget.checked
                    ? [...current, item]
                    : current.filter((entry) => entry !== item),
                );
              }}
            />
            {item.toUpperCase()}
          </label>
        ))}
      </fieldset>
    );
  if (d.type === "list")
    return (
      <input
        id={d.id}
        type="text"
        value={Array.isArray(value) ? value.join(", ") : ""}
        disabled={disabled}
        onChange={(event) =>
          change(
            event.currentTarget.value
              .split(",")
              .map((v) => v.trim().toLowerCase())
              .filter(Boolean),
          )
        }
      />
    );
  const common = {
    id: d.id,
    value: String(value),
    disabled,
    onChange: (event: Event) => change((event.currentTarget as HTMLInputElement).value),
  };
  if (d.type === "color") return <input type="color" {...common} />;
  if (d.format === "time") return <input type="time" {...common} />;
  if (d.format === "https") return <input type="url" {...common} />;
  return <input type="text" {...common} />;
}

function DataPane({
  stats,
  highScores,
  refresh,
  tell,
}: {
  stats: PlayStats;
  highScores: Record<string, number>;
  refresh: () => void;
  tell: (status: Status) => void;
}) {
  const file = useRef<HTMLInputElement>(null);
  const dates = Array.from({ length: 7 }, (_, index) => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - 6 + index);
    return dayKey(d.getTime());
  });
  const totals = dates.map((date) => dayTotal(stats, date));
  const max = Math.max(60000, ...totals);
  const gameTotals: Record<string, number> = {};
  for (const day of Object.values(stats.days))
    for (const [game, ms] of Object.entries(day.games))
      gameTotals[game] = (gameTotals[game] ?? 0) + ms;
  const download = async () => {
    const backup = await exportBackup();
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "interlude-backup.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    tell({ message: "BACKUP EXPORTED" });
  };
  const importFile = async (selected: File | undefined) => {
    if (!selected) return;
    try {
      if (selected.size > 5_000_000) throw new Error("Backup is too large");
      const data: unknown = JSON.parse(await selected.text());
      if (
        !window.confirm(
          "Import settings and local records from this file? Existing values with the same keys will be replaced.",
        )
      )
        return;
      await importBackup(data);
      refresh();
      tell({ message: "BACKUP IMPORTED" });
    } catch (error) {
      tell({ message: error instanceof Error ? error.message : "IMPORT FAILED", error: true });
    } finally {
      if (file.current) file.current.value = "";
    }
  };
  const wipe = async () => {
    if (
      !window.confirm(
        "Wipe ALL settings, profiles, scores, play statistics, selectors and local state? This cannot be undone. Close supported chat tabs and any open popup game first to prevent new records being written.",
      )
    )
      return;
    try {
      const { syncCleared } = await wipeEverything();
      refresh();
      tell(
        syncCleared
          ? { message: "LOCAL AND SYNC DATA WIPED" }
          : {
              message: "LOCAL DATA WIPED / SYNC COULD NOT BE CLEARED. RETRY WHEN AVAILABLE.",
              error: true,
            },
      );
    } catch {
      refresh();
      tell({ message: "WIPE FAILED / CHECK STORAGE AND RETRY", error: true });
    }
  };
  return (
    <>
      <section class="data-block">
        <h3>LAST 7 DAYS</h3>
        <p>
          {Math.floor(dayTotal(stats, dayKey(Date.now())) / 60000)} MIN TODAY ·{" "}
          {streak(stats, Date.now())} DAY STREAK
        </p>
        <div
          class="chart"
          role="img"
          aria-label={dates
            .map((date, i) => `${date}: ${Math.floor(totals[i]! / 60000)} minutes`)
            .join(", ")}
        >
          {dates.map((date, i) => (
            <div class="bar-wrap" key={date}>
              <span>{Math.floor(totals[i]! / 60000)}m</span>
              <div
                class={`bar ${i === 6 ? "today" : ""}`}
                style={{ height: `${Math.max(2, (totals[i]! / max) * 70)}px` }}
              />
              <span>{date.slice(5)}</span>
            </div>
          ))}
        </div>
      </section>
      <section class="data-block">
        <h3>PLAY TIME / CABINET</h3>
        <div class="scores">
          {GAME_MANIFESTS.map((game) => (
            <div key={game.id}>
              {game.name} · {Math.floor((gameTotals[game.id] ?? 0) / 60000)} MIN
            </div>
          ))}
        </div>
      </section>
      <section class="data-block">
        <h3>LOCAL HI-SCORES</h3>
        <div class="scores">
          {Object.entries(highScores).length ? (
            Object.entries(highScores)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([game, score]) => (
                <div key={game}>
                  {game.toUpperCase()} · {score}
                </div>
              ))
          ) : (
            <span>NO RECORDS YET</span>
          )}
        </div>
      </section>
      <section class="data-block">
        <h3>BACKUP / RESTORE</h3>
        <p>
          Export every profile, setting, local score, statistic and selector override as JSON.
          Nothing is uploaded.
        </p>
        <div class="data-actions">
          <button type="button" onClick={() => void download()}>
            EXPORT JSON
          </button>
          <button type="button" onClick={() => file.current?.click()}>
            IMPORT JSON
          </button>
          <button type="button" class="danger" onClick={() => void wipe()}>
            WIPE EVERYTHING
          </button>
        </div>
        <input
          ref={file}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(event) => void importFile(event.currentTarget.files?.[0])}
        />
      </section>
    </>
  );
}

function App({ initial }: { initial: SettingsDocument }) {
  const [documentState, setDocument] = useState(initial);
  const [profile, setProfile] = useState<Profile>("global");
  const [page, setPage] = useState<Page>("Display");
  const [query, setQuery] = useState("");
  const [changedOnly, setChangedOnly] = useState(false);
  const [status, setStatus] = useState<Status>({ message: "READY / SETTINGS SYNC WHEN AVAILABLE" });
  const [stats, setStats] = useState<PlayStats>(emptyStats());
  const [highScores, setHighScores] = useState<Record<string, number>>({});
  const [update, setUpdate] = useState<{
    available?: boolean;
    version?: string;
    url?: string;
  } | null>(null);
  const site = profileSite(profile),
    settings = resolveSettings(documentState, site);
  const refresh = () => {
    void loadSettingsDocument().then(setDocument);
    void loadStats().then(setStats);
    void loadHighScores().then(setHighScores);
    void chrome.storage.local
      .get("interlude.updateStatus")
      .then((data) => setUpdate((data["interlude.updateStatus"] ?? null) as typeof update));
  };
  useEffect(() => {
    refresh();
    const listener = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
      if (
        (area === "sync" || area === "local") &&
        (changes[SETTINGS_KEY] ||
          changes[STATS_KEY] ||
          changes["interlude.highscores"] ||
          changes["interlude.updateStatus"])
      )
        refresh();
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);
  const changed = (d: SettingDefinition): boolean =>
    site && d.perSite
      ? has(documentState.sites[site], d.id)
      : has(documentState.global, d.id) && !equals(documentState.global[d.id], d.default);
  const updateSetting = async (d: SettingDefinition, value: SettingValue) => {
    if (!validValue(d, value)) {
      setStatus({ message: `INVALID VALUE / ${d.label.toUpperCase()}`, error: true });
      return;
    }
    const scope = d.perSite ? site : undefined;
    await saveSettings({ [d.id]: value }, scope);
    refresh();
    setStatus({ message: "SAVED / LIVE" });
  };
  const reset = async (ids: string[]) => {
    const scoped = ids.filter((id) => site && SETTINGS_BY_ID.get(id)?.perSite);
    const global = ids.filter((id) => !scoped.includes(id));
    if (scoped.length) await resetSettings(scoped, site);
    if (global.length) await resetSettings(global);
    refresh();
    setStatus({ message: "RESET / LIVE" });
  };
  const search = query.trim().toLowerCase();
  let list = search
    ? [...SETTINGS_SCHEMA]
    : page === "Diagnostics" || page === "Data"
      ? []
      : definitionsFor(page);
  if (search)
    list = list.filter((item) =>
      [item.label, item.description, item.category, ...item.tags]
        .join(" ")
        .toLowerCase()
        .includes(search),
    );
  if (changedOnly) list = list.filter(changed);
  const title = search ? "SEARCH RESULTS" : page.toUpperCase();
  return (
    <div class="app">
      <header class="header">
        <a class="wordmark" href="options.html">
          <span class="brandmark" aria-hidden="true" />
          INTERLUDE
        </a>
        <span class="header-right">
          OPERATOR MANUAL / <strong>LOCAL CONTROL</strong> / REV 02
        </span>
      </header>
      <div class="heading">
        <div>
          <div class="eyebrow">FIELD MANUAL / CONTROL SURFACE</div>
          <h1>
            OPERATOR
            <br />
            SETTINGS.
          </h1>
        </div>
        <p>
          Adjust the cabinet, not the conversation. Changes apply live. Settings sync when
          available; play records stay local.
        </p>
      </div>
      {settings.updateChecks && update?.available && update.url && (
        <div class="update">
          UPDATE {update.version} AVAILABLE. Download the zip, replace the unpacked folder and
          reload in Chrome.
          <a href={update.url} target="_blank" rel="noreferrer">
            DOWNLOAD ↗
          </a>
        </div>
      )}
      <div class="profiles">
        <span class="label">ACTIVE PROFILE</span>
        <div class="profile-buttons">
          {(["global", ...SITES] as Profile[]).map((item) => (
            <button
              type="button"
              aria-pressed={profile === item}
              onClick={() => setProfile(item)}
              key={item}
            >
              {item === "global" ? "GLOBAL" : item.toUpperCase()}
              {(item === "chatgpt" || item === "gemini") && <span class="beta">BETA</span>}
            </button>
          ))}
        </div>
      </div>
      <div class="workspace">
        <nav class="rail" aria-label="Settings categories">
          <div class="rail-title">INDEX / 01-10</div>
          {([...CATEGORIES, "Diagnostics"] as Page[]).map((category, index) => (
            <button
              type="button"
              aria-current={page === category && !search ? "page" : undefined}
              onClick={() => {
                setPage(category);
                setQuery("");
              }}
              key={category}
            >
              {category.toUpperCase()} <span>{String(index + 1).padStart(2, "0")}</span>
            </button>
          ))}
        </nav>
        <main class="pane">
          <div class="searchbar">
            <input
              type="search"
              aria-label="Search settings"
              placeholder="SEARCH LABELS, DESCRIPTIONS, TAGS…"
              value={query}
              onInput={(event) => setQuery(event.currentTarget.value)}
            />
            <label class="changed">
              <input
                type="checkbox"
                checked={changedOnly}
                onChange={(event) => setChangedOnly(event.currentTarget.checked)}
              />
              ONLY CHANGED
            </label>
          </div>
          <div class="section-head">
            <div>
              <div class="eyebrow">
                {profile.toUpperCase()} / {search ? "FIND" : "SECTION"}
              </div>
              <h2>{title}</h2>
            </div>
            {page !== "Data" && page !== "Diagnostics" && !search && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`Reset ${page} in this profile?`))
                    void reset(definitionsFor(page).map((s) => s.id));
                }}
              >
                RESET SECTION
              </button>
            )}
          </div>
          <div class={`save-status ${status.error ? "error" : ""}`} role="status">
            {status.message}
          </div>
          {!search && page === "Diagnostics" ? (
            <iframe class="diag-frame" src="diagnostics.html?embedded=1" title="Live diagnostics" />
          ) : !search && page === "Data" ? (
            <DataPane stats={stats} highScores={highScores} refresh={refresh} tell={setStatus} />
          ) : (
            <>
              {page === "Advanced" && !search && (
                <p class="empty-state">
                  Inspect live signals, selector matches and remote-check status.{" "}
                  <button type="button" onClick={() => setPage("Diagnostics")}>
                    OPEN DIAGNOSTICS
                  </button>
                </p>
              )}
              {page === "Sites" && !search && (
                <p class="empty-state">
                  Choose a site profile above to override its power, placement and delay. ChatGPT
                  and Gemini are beta; verify their selectors in Diagnostics.
                </p>
              )}
              {list.map((d) => {
                const value = settings[d.id] ?? d.default;
                const disabled = !!d.requires && !equals(settings[d.requires.id], d.requires.value);
                const localOverride = !!site && d.perSite && has(documentState.sites[site], d.id);
                const scope = site
                  ? d.perSite
                    ? localOverride
                      ? "SITE OVERRIDE"
                      : "INHERITS GLOBAL"
                    : "GLOBAL SETTING"
                  : "GLOBAL SETTING";
                const conflict = (code: string): string | null => {
                  if (!d.binding) {
                    setStatus({
                      message: "USE ALT, CTRL OR META + A LETTER OR DIGIT",
                      error: true,
                    });
                    return "invalid";
                  }
                  const other = (GAME_ACTIONS[d.binding.game] ?? []).find(
                    (action) =>
                      action !== d.binding!.action &&
                      settings[`key.${d.binding!.game}.${action}`] === code,
                  );
                  if (other) {
                    const message = `${code} IS ALREADY ASSIGNED TO ${other.toUpperCase()}`;
                    setStatus({ message, error: true });
                    return message;
                  }
                  return null;
                };
                return (
                  <div class={`setting ${disabled ? "disabled" : ""}`} key={d.id}>
                    <div>
                      <label class="setting-title" for={d.id}>
                        {d.label}
                      </label>
                      <p>{d.description}</p>
                      <div class="setting-meta">
                        {scope}
                        {changed(d) && (
                          <>
                            {" "}
                            / <strong>CHANGED</strong>
                          </>
                        )}
                        {d.requires && disabled && (
                          <> / REQUIRES {SETTINGS_BY_ID.get(d.requires.id)?.label.toUpperCase()}</>
                        )}
                        {d.reload && <> / APPLIES AFTER RELOAD</>}
                      </div>
                    </div>
                    <div class="control-group">
                      <SettingsControl
                        definition={d}
                        value={value}
                        disabled={disabled}
                        change={(next) => void updateSetting(d, next)}
                        conflict={conflict}
                      />
                      <button
                        class="reset"
                        type="button"
                        aria-label={`Reset ${d.label}`}
                        onClick={() => void reset([d.id])}
                      >
                        ↺ RESET
                      </button>
                    </div>
                  </div>
                );
              })}
              {!list.length && <div class="empty-state">NO MATCHING SETTINGS.</div>}
            </>
          )}
        </main>
        <Preview settings={settings} />
      </div>
    </div>
  );
}
const root = document.getElementById("app")!;
root.replaceChildren();
render(<App initial={await loadSettingsDocument()} />, root);
