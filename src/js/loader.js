// loader.js - Loads all JSON design docs at runtime

const gameLoader = {
    data: {},

    // Docs live at ../docs/ locally (when opened from src/) but at docs/ on
    // GitHub Pages (where the workflow copies docs into src/docs/).
    _docBase: null,

    async _resolveDocBase() {
        if (this._docBase !== null) return this._docBase;
        // Try the Pages-relative path first, fall back to local
        try {
            const r = await fetch('docs/floors.json', { method: 'HEAD' });
            if (r.ok) { this._docBase = 'docs/'; return this._docBase; }
        } catch (_) { /* ignore */ }
        this._docBase = '../docs/';
        return this._docBase;
    },

    async loadAllData() {
        const base = await this._resolveDocBase();
        const files = [
            { key: 'floors',           path: `${base}floors.json` },
            { key: 'enemies',          path: `${base}enemies.json` },
            { key: 'specializations',  path: `${base}specializations.json` },
            { key: 'artifacts',        path: `${base}artifacts.json` },
            { key: 'consumables',      path: `${base}consumables.json` },
            { key: 'permanentTools',   path: `${base}permanent_tools.json` },
            { key: 'shopEconomy',      path: `${base}shop_economy.json` },
            { key: 'stats',            path: `${base}stats_system.json` },
        ];

        const results = await Promise.allSettled(
            files.map(({ key, path }) =>
                fetch(path)
                    .then(r => r.json())
                    .then(json => { this.data[key] = json; })
                    .catch(err => console.warn(`Could not load ${path}:`, err))
            )
        );

        const loaded = results.filter(r => r.status === 'fulfilled').length;
        console.log(`Loaded ${loaded}/${files.length} data files`);
        return loaded > 0;
    },

    // ── Floors ──────────────────────────────────────────
    getFloorData(floorNumber) {
        const floors = this.data.floors?.floors ?? [];
        return floors.find(f => f.floor === floorNumber) ?? null;
    },

    // ── Enemies ─────────────────────────────────────────
    getFloorEnemies(floorNumber) {
        const sys = this.data.enemies?.enemy_system;
        if (!sys) return [];
        const key = Object.keys(sys).find(k => sys[k]?.floor === floorNumber);
        return key ? (sys[key].enemies ?? []) : [];
    },

    getFloorBoss(floorNumber) {
        const sys = this.data.enemies?.enemy_system;
        if (!sys) return null;
        const key = Object.keys(sys).find(k => sys[k]?.floor === floorNumber);
        return key ? (sys[key].boss ?? null) : null;
    },

    // ── Specializations ─────────────────────────────────
    getSpecialization(id) {
        const specs = this.data.specializations?.specializations ?? [];
        return specs.find(s => s.id === id) ?? null;
    },

    getAllSpecializations() {
        return this.data.specializations?.specializations ?? [];
    },

    // ── Artifacts ───────────────────────────────────────
    getAllArtifacts() {
        const sys = this.data.artifacts?.artifact_system;
        if (!sys) return [];
        return [
            ...(sys.consumable_artifacts?.consumable_types ?? []),
            ...(sys.weapon_artifacts?.catalog ?? []),
        ];
    },

    // ── Shop ────────────────────────────────────────────
    getShopInventory(floorNumber) {
        const floors = this.data.shopEconomy?.shop_system?.floor_shops ?? [];
        return floors.find(f => f.floor === floorNumber) ?? null;
    },
};
