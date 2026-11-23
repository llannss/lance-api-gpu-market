// ============================================
// GPU Nexus Marketplace
// Served at /market/ on the GPU Nexus site (a rewrite in the Finder's
// vercel.json), so it shares the sign-in cookie and /api with the Finder
// and GPU Guessr. One page; the part after # picks the view:
//   #/            browse        #/listing/12   one listing
//   #/sell        new listing   #/edit/12      change a listing
//   #/mine        my listings   #/inbox        conversations
//   #/chat/7      one conversation
// ============================================

const NEXUS = "https://lance-api-gpu-finder.vercel.app";
const PHP_PER_USD = 58;          // fixed rate for showing prices in the other currency
const MAX_PHOTOS = 6;
const PHOTO_SIDE = 2000;         // photos are shrunk in the browser before upload
const UNREAD_POLL_MS = 30000;
const CHAT_POLL_MS = 6000;

const CONDITIONS = {
    new: "New",
    like_new: "Like new",
    good: "Good",
    fair: "Fair",
    for_parts: "For parts",
};

const $ = (id) => document.getElementById(id);
const view = () => $("view");

let account = null;
let profileName = null;      // the public Marketplace name; null until chosen
let catalog = [];
let currency = readStore("mk-currency", "PHP");
let stopChatPoll = null;


// ============================================
// HELPERS
// ============================================

function escapeHTML(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function readStore(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        return raw == null ? fallback : JSON.parse(raw);
    } catch {
        return fallback;
    }
}

function writeStore(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // storage off: the choice just isn't remembered
    }
}

function icon(paths, cls = "icon") {
    return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

const ICONS = {
    pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    user: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 19.5c1.2-3.3 3.8-5 7-5s5.8 1.7 7 5"/>',
    camera: '<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.5-2h6l1.5 2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z"/><circle cx="12" cy="13" r="3.5"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    star: '<path d="m12 3.8 2.5 5.1 5.6.8-4 3.9.9 5.6-5-2.6-5 2.6.9-5.6-4-3.9 5.6-.8z"/>',
    send: '<path d="M4 12 20 4l-6 16-2.5-6.5z"/>',
    back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    search: '<circle cx="11" cy="11" r="6"/><path d="m20 20-4.5-4.5"/>',
    shield: '<path d="M12 3 5 6v5c0 4.4 3 8.4 7 10 4-1.6 7-5.6 7-10V6z"/><path d="m9 12 2 2 4-4"/>',
    flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    chip: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2.5v3M15 2.5v3M9 18.5v3M15 18.5v3M2.5 9h3M2.5 15h3M18.5 9h3M18.5 15h3"/>',
};

// A listing's price in the chosen currency; "≈" when converted.
function priceText(amount, from) {
    if (amount == null) return "";
    let value = Number(amount);
    let approx = false;
    if (from !== currency) {
        value = from === "USD" ? value * PHP_PER_USD : value / PHP_PER_USD;
        approx = true;
    }
    const symbol = currency === "USD" ? "$" : "₱";
    const digits = currency === "USD" && value < 100 ? 2 : 0;
    const text = value.toLocaleString("en-PH", { minimumFractionDigits: digits, maximumFractionDigits: digits });
    return `${approx ? "≈ " : ""}${symbol}${text}`;
}

function originalPrice(amount, from) {
    const symbol = from === "USD" ? "$" : "₱";
    return `${symbol}${Number(amount).toLocaleString("en-PH", { maximumFractionDigits: 2 })}`;
}

function timeAgo(iso) {
    const then = new Date(iso).getTime();
    if (!Number.isFinite(then)) return "";
    const seconds = Math.round((then - Date.now()) / 1000);
    const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
    const steps = [[60, "second"], [60, "minute"], [24, "hour"], [7, "day"], [4.35, "week"], [12, "month"], [Infinity, "year"]];
    let value = seconds;
    for (const [size, unit] of steps) {
        if (Math.abs(value) < size) return rtf.format(Math.round(value), unit);
        value /= size;
    }
    return "";
}

function monthYear(iso) {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en", { month: "short", year: "numeric" });
}

// The name others see. Asked once, the first time someone sells or messages,
// so the Marketplace never shows any part of an email address.
function nameField(id) {
    return profileName ? "" : `
        <div class="field name-field">
            <label for="${id}">Your name on the Marketplace</label>
            <input id="${id}" maxlength="40" autocomplete="nickname" placeholder="e.g. Lans or LansPC Parts">
            <p class="hint">Buyers and sellers see this instead of your email. You only set it once.</p>
            <p class="form-error" data-for="${id}" hidden></p>
        </div>`;
}

async function saveName(id) {
    if (profileName) return true;
    const input = $(id);
    const error = document.querySelector(`[data-for="${id}"]`);
    const value = input.value.trim();
    if (value.length < 2) {
        error.textContent = "Choose a name of at least 2 characters.";
        error.hidden = false;
        input.setAttribute("aria-invalid", "true");
        input.focus();
        return false;
    }
    try {
        const saved = await send("/me/profile", "PUT", { display_name: value });
        profileName = saved.display_name;
        return true;
    } catch (e) {
        error.textContent = e.message;
        error.hidden = false;
        input.setAttribute("aria-invalid", "true");
        input.focus();
        return false;
    }
}

function listingYear(gpu) {
    const year = Number(String(gpu?.release_date || "").slice(0, 4));
    return Number.isFinite(year) && year > 0 ? year : null;
}

// Broken photos show the drawn picture icon instead of the broken-image mark.
document.addEventListener("error", (event) => {
    const img = event.target;
    if (img instanceof HTMLImageElement && !img.closest(".brand")) {
        img.hidden = true;
        img.parentElement?.classList.add("is-missing");
    }
}, true);


// ============================================
// API
// ============================================

function goToSignIn() {
    location.replace(`/signin.html?next=${encodeURIComponent(`market/${location.search}${location.hash}`)}`);
}

async function api(path, options = {}) {
    const response = await fetch(`/api${path}`, {
        credentials: "same-origin",
        cache: "no-store",
        ...options,
        headers: { Accept: "application/json", "X-Requested-With": "fetch", ...(options.headers || {}) },
    });
    if (response.status === 401) {
        goToSignIn();
        throw new Error("Your sign-in ran out.");
    }
    const data = response.status === 204 ? {} : await response.json().catch(() => ({}));
    if (!response.ok) {
        const detail = Array.isArray(data.detail)
            ? data.detail.map((d) => d.msg).join(" ")
            : data.detail || data.error;
        const error = new Error(detail || "Something went wrong. Try again.");
        error.status = response.status;
        throw error;
    }
    return data;
}

const send = (path, method, body) => api(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
});


// ============================================
// SHELL: sign-in, menu, currency, unread badge, routing
// ============================================

async function requireSignIn() {
    if (!location.pathname.startsWith("/market")) {
        location.replace(`${NEXUS}/market/${location.search}${location.hash}`);
        return null;
    }
    let response = null;
    try {
        response = await fetch("/api/auth/me", { cache: "no-store", credentials: "same-origin" });
    } catch {
        // reported below
    }
    if (response?.status === 401) {
        goToSignIn();
        return null;
    }
    if (!response?.ok) throw new Error("Couldn't check your GPU Nexus sign-in.");
    return response.json();
}

function setupMenu() {
    const menu = $("nexusMenu");
    const toggle = $("nexusToggle");
    $("nexusAccount").textContent = `Signed in as ${account.email}`;
    $("avatar").textContent = (profileName || account.email || "?")[0].toUpperCase();

    const setOpen = (open) => {
        menu.classList.toggle("is-open", open);
        toggle.setAttribute("aria-expanded", String(open));
    };
    toggle.addEventListener("click", () => setOpen(!menu.classList.contains("is-open")));
    document.addEventListener("click", (event) => {
        if (!menu.contains(event.target)) setOpen(false);
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && menu.classList.contains("is-open")) {
            setOpen(false);
            toggle.focus();
        }
    });
    $("signOut").addEventListener("click", async () => {
        $("signOut").disabled = true;
        try {
            await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin", headers: { "X-Requested-With": "fetch" } });
        } finally {
            location.replace("/signin.html");
        }
    });
}

function setupCurrency() {
    const buttons = document.querySelectorAll("[data-currency]");
    const paint = () => buttons.forEach((b) => b.setAttribute("aria-checked", String(b.dataset.currency === currency)));
    paint();
    buttons.forEach((b) => b.addEventListener("click", () => {
        if (currency === b.dataset.currency) return;
        currency = b.dataset.currency;
        writeStore("mk-currency", currency);
        paint();
        route();   // redraw prices
    }));
}

async function refreshUnread() {
    try {
        const { unread } = await api("/me/unread");
        for (const id of ["unreadBadge", "unreadBadgeTab"]) {
            $(id).hidden = !unread;
            $(id).textContent = unread > 9 ? "9+" : String(unread);
        }
        document.querySelector(".inbox-link")?.setAttribute("aria-label", unread ? `Inbox, ${unread} unread` : "Inbox");
    } catch {
        // the badge just stays as it was
    }
}

function markNav(name) {
    document.querySelectorAll("[data-nav]").forEach((a) => {
        const on = a.dataset.nav === name;
        a.classList.toggle("is-active", on);
        if (on) a.setAttribute("aria-current", "page");
        else a.removeAttribute("aria-current");
    });
}

function route() {
    stopChatPoll?.();
    stopChatPoll = null;
    const hash = location.hash.replace(/^#/, "") || "/";
    const [path, query = ""] = hash.split("?");
    const params = new URLSearchParams(query);
    const parts = path.split("/").filter(Boolean);

    if (parts[0] === "listing" && parts[1]) return show("browse", () => renderListing(Number(parts[1])));
    if (parts[0] === "sell") return show("sell", () => renderForm(null));
    if (parts[0] === "edit" && parts[1]) return show("mine", () => renderForm(Number(parts[1])));
    if (parts[0] === "mine") return show("mine", renderMine);
    if (parts[0] === "inbox") return show("inbox", renderInbox);
    if (parts[0] === "chat" && parts[1]) return show("inbox", () => renderChat(Number(parts[1])));
    return show("browse", () => renderBrowse(params));
}

async function show(navName, render) {
    markNav(navName);
    view().innerHTML = `<p class="loading">Loading…</p>`;
    try {
        await render();
    } catch (error) {
        if (error.message === "Your sign-in ran out.") return;
        view().innerHTML = `
            <section class="panel notice is-error" role="alert">
                <h1>That didn't load</h1>
                <p>${escapeHTML(error.status === 404 ? "This listing or conversation doesn't exist anymore." : error.message)}</p>
                <a class="btn btn-ghost" href="#/">Back to all listings</a>
            </section>`;
    }
    view().focus({ preventScroll: true });
}

function go(hash) {
    if (location.hash === hash) route();
    else location.hash = hash;
}


// ============================================
// BROWSE
// ============================================

let browseState = { q: "", condition: "", sort: "new" };

function listingCard(item) {
    const cover = item.photos?.[0];
    return `
        <a class="listing-card" href="#/listing/${item.id}">
            <span class="listing-photo${cover ? "" : " is-missing"}">${cover ? `<img src="${escapeHTML(cover)}" alt="" loading="lazy" decoding="async">` : ""}
                ${item.status === "sold" ? `<span class="sold-tag">Sold</span>` : ""}
            </span>
            <span class="listing-body">
                <span class="listing-price">${escapeHTML(priceText(item.price, item.currency))}</span>
                <span class="listing-title">${escapeHTML(item.title)}</span>
                <span class="listing-meta">
                    <span class="chip">${escapeHTML(CONDITIONS[item.condition] || item.condition)}</span>
                    ${item.location ? `<span>${icon(ICONS.pin)}${escapeHTML(item.location)}</span>` : ""}
                </span>
                <span class="listing-foot">${escapeHTML(item.seller.name)} · ${escapeHTML(timeAgo(item.created_at))}</span>
            </span>
        </a>`;
}

async function renderBrowse(params) {
    const gpuId = Number(params.get("gpu")) || null;
    const data = await api(`/listings${gpuId ? `?gpu_id=${gpuId}` : ""}`);
    const gpu = gpuId ? catalog.find((g) => Number(g.id) === gpuId) : null;
    const all = data.listings;

    view().innerHTML = `
        <section class="browse-head">
            <div>
                <h1>${gpu ? `Used ${escapeHTML(gpu.model)}` : "Used GPUs for sale"}</h1>
                <p>${gpu
                    ? `${data.total} listing${data.total === 1 ? "" : "s"} for this card. <a href="/gpu.html?id=${gpu.id}">See its full specs in the Finder</a> · <a href="#/">All listings</a>`
                    : `${data.total} listing${data.total === 1 ? "" : "s"} from GPU Nexus members. Message a seller to ask questions or set up a meet-up.`}</p>
            </div>
        </section>

        <div class="filters" role="search">
            <label class="search-box">
                ${icon(ICONS.search)}
                <span class="visually-hidden">Search listings</span>
                <input id="q" type="search" placeholder="Search listings, e.g. 3080" value="${escapeHTML(browseState.q)}" autocomplete="off">
            </label>
            <label class="select-box">
                <span class="visually-hidden">Condition</span>
                <select id="condition">
                    <option value="">Any condition</option>
                    ${Object.entries(CONDITIONS).map(([k, v]) => `<option value="${k}" ${browseState.condition === k ? "selected" : ""}>${v}</option>`).join("")}
                </select>
            </label>
            <label class="select-box">
                <span class="visually-hidden">Sort</span>
                <select id="sort">
                    <option value="new" ${browseState.sort === "new" ? "selected" : ""}>Newest first</option>
                    <option value="low" ${browseState.sort === "low" ? "selected" : ""}>Price: low to high</option>
                    <option value="high" ${browseState.sort === "high" ? "selected" : ""}>Price: high to low</option>
                </select>
            </label>
        </div>

        <div class="listing-grid" id="grid"></div>`;

    const inPhp = (l) => (l.currency === "USD" ? l.price * PHP_PER_USD : l.price);
    const draw = () => {
        const words = browseState.q.toLowerCase().split(/\s+/).filter(Boolean);
        let items = all.filter((l) => {
            const hay = `${l.title} ${l.description} ${l.gpu?.model || ""} ${l.gpu?.brand || ""} ${l.location}`.toLowerCase();
            return words.every((w) => hay.includes(w)) && (!browseState.condition || l.condition === browseState.condition);
        });
        if (browseState.sort === "low") items = [...items].sort((a, b) => inPhp(a) - inPhp(b));
        if (browseState.sort === "high") items = [...items].sort((a, b) => inPhp(b) - inPhp(a));
        $("grid").innerHTML = items.length
            ? items.map(listingCard).join("")
            : `<div class="empty">
                   ${icon(ICONS.camera, "icon empty-icon")}
                   <h2>${all.length ? "No listings match" : "Nothing for sale yet"}</h2>
                   <p>${all.length ? "Try fewer words or any condition." : "Be the first: snap a few photos of a card you don't use anymore."}</p>
                   ${all.length ? "" : `<a class="btn btn-primary" href="#/sell">Sell a GPU</a>`}
               </div>`;
    };
    draw();
    $("q").addEventListener("input", (e) => { browseState.q = e.target.value; draw(); });
    $("condition").addEventListener("change", (e) => { browseState.condition = e.target.value; draw(); });
    $("sort").addEventListener("change", (e) => { browseState.sort = e.target.value; draw(); });
}


// ============================================
// ONE LISTING
// ============================================

async function renderListing(id) {
    const item = await api(`/listings/${id}`);
    const photos = item.photos || [];
    const gpu = item.gpu;

    view().innerHTML = `
        <a class="back-link" href="#/">${icon(ICONS.back)}All listings</a>
        <article class="listing-page">
            <div class="gallery">
                <div class="gallery-main${photos.length ? "" : " is-missing"}">
                    ${photos.length ? `<img id="mainPhoto" src="${escapeHTML(photos[0])}" alt="${escapeHTML(item.title)}" decoding="async">` : ""}
                    ${item.status === "sold" ? `<span class="sold-tag">Sold</span>` : ""}
                </div>
                ${photos.length > 1 ? `<div class="gallery-thumbs">${photos.map((url, i) => `
                    <button class="thumb${i === 0 ? " is-active" : ""}" type="button" data-photo="${i}" aria-label="Photo ${i + 1} of ${photos.length}">
                        <img src="${escapeHTML(url)}" alt="" loading="lazy" decoding="async">
                    </button>`).join("")}</div>` : ""}
            </div>

            <div class="listing-side">
                <h1>${escapeHTML(item.title)}</h1>
                <p class="big-price">${escapeHTML(priceText(item.price, item.currency))}</p>
                ${item.currency !== currency ? `<p class="price-note">Listed at ${escapeHTML(originalPrice(item.price, item.currency))}. Converted at ₱${PHP_PER_USD} per $1.</p>` : ""}
                <ul class="facts">
                    <li><span class="chip">${escapeHTML(CONDITIONS[item.condition] || item.condition)}</span></li>
                    ${item.location ? `<li>${icon(ICONS.pin)}${escapeHTML(item.location)}</li>` : ""}
                    <li>${icon(ICONS.user)}${escapeHTML(item.seller.name)}</li>
                    <li>${icon(ICONS.clock)}Listed ${escapeHTML(timeAgo(item.created_at))}</li>
                </ul>

                <div class="seller-box" id="sellerBox"></div>

                ${gpu ? `
                    <a class="gpu-link" href="/gpu.html?id=${gpu.id}">
                        <span class="gpu-link-photo${gpu.image_url ? "" : " is-missing"}">${gpu.image_url ? `<img src="${escapeHTML(gpu.image_url)}" alt="" loading="lazy" decoding="async">` : ""}</span>
                        <span>
                            <strong>${escapeHTML(gpu.model)}</strong>
                            <small>${escapeHTML([gpu.brand, gpu.vram, listingYear(gpu) ? `launched ${listingYear(gpu)}` : "", gpu.launch_price_usd ? `at $${Number(gpu.launch_price_usd).toLocaleString()}` : ""].filter(Boolean).join(" · "))}</small>
                            <span class="gpu-link-cta">See full specs in the Finder</span>
                        </span>
                    </a>` : ""}

                ${item.description ? `<div class="description"><h2>From the seller</h2><p>${escapeHTML(item.description)}</p></div>` : ""}
            </div>
        </article>`;

    view().querySelectorAll("[data-photo]").forEach((btn) => btn.addEventListener("click", () => {
        const main = $("mainPhoto");
        main.src = photos[Number(btn.dataset.photo)];
        // blur bridges the two photos so the swap reads as one change
        if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
            main.animate(
                [{ opacity: 0.4, filter: "blur(4px)" }, { opacity: 1, filter: "blur(0)" }],
                { duration: 160, easing: "cubic-bezier(0.23, 1, 0.32, 1)" }
            );
        }
        view().querySelectorAll(".thumb").forEach((t) => t.classList.toggle("is-active", t === btn));
    }));

    const box = $("sellerBox");
    const seller = item.seller;
    const record = `
        <div class="seller-card">
            <span class="seller-avatar" aria-hidden="true">${escapeHTML(seller.name[0] || "?")}</span>
            <span>
                <strong>${escapeHTML(seller.name)}</strong>
                <small>${[seller.member_since ? `Member since ${escapeHTML(monthYear(seller.member_since))}` : "",
                          `${seller.for_sale ?? 0} for sale`, `${seller.sold ?? 0} sold`].filter(Boolean).join(" · ")}</small>
            </span>
        </div>`;

    if (item.is_mine) {
        box.innerHTML = `
            <p class="box-title">This is your listing</p>
            <div class="row-actions">
                <a class="btn btn-ghost" href="#/edit/${item.id}">Edit listing</a>
                <button class="btn btn-ghost" type="button" id="toggleSold">${item.status === "sold" ? "Put back on sale" : "Mark as sold"}</button>
                <button class="btn btn-danger-quiet" type="button" id="deleteListing" aria-expanded="false" aria-controls="confirmDelete">Delete</button>
            </div>
            <div class="confirm-panel" id="confirmDelete" hidden>
                <p><strong>Delete this listing?</strong> Its ${(item.photos || []).length || "no"} photo${(item.photos || []).length === 1 ? "" : "s"} and any messages about it go too. This can't be undone.</p>
                <div class="row-actions">
                    <button class="btn btn-danger" type="button" id="confirmDeleteYes">Delete listing</button>
                    <button class="btn btn-quiet" type="button" id="confirmDeleteNo">Keep it</button>
                </div>
            </div>
            <p class="form-error" id="ownError" role="alert" hidden></p>`;
        $("toggleSold").addEventListener("click", async () => {
            await send(`/listings/${item.id}`, "PATCH", { status: item.status === "sold" ? "active" : "sold" });
            route();
        });
        const panel = $("confirmDelete");
        const setPanel = (open) => {
            panel.hidden = !open;
            $("deleteListing").setAttribute("aria-expanded", String(open));
            (open ? $("confirmDeleteNo") : $("deleteListing")).focus();
        };
        $("deleteListing").addEventListener("click", () => setPanel(panel.hidden));
        $("confirmDeleteNo").addEventListener("click", () => setPanel(false));
        $("confirmDeleteYes").addEventListener("click", async () => {
            $("confirmDeleteYes").disabled = true;
            $("confirmDeleteYes").textContent = "Deleting…";
            try {
                await api(`/listings/${item.id}`, { method: "DELETE" });
                go("#/mine");
            } catch (error) {
                $("ownError").textContent = error.message;
                $("ownError").hidden = false;
                $("confirmDeleteYes").disabled = false;
                $("confirmDeleteYes").textContent = "Delete listing";
            }
        });
    } else if (item.status === "sold") {
        box.innerHTML = `<p class="box-title">This GPU has been sold</p><p class="muted">Look for another one in <a href="#/">all listings</a>.</p>`;
    } else {
        box.innerHTML = `
            ${record}
            <form id="askForm" novalidate>
                <label class="box-title" for="askBody">Message ${escapeHTML(item.seller.name)}</label>
                <textarea id="askBody" rows="3" maxlength="2000">Hi! Is this still available?</textarea>
                ${nameField("askName")}
                <p class="form-error" id="askError" role="alert" hidden></p>
                <button class="btn btn-primary" type="submit">${icon(ICONS.send)}Send message</button>
            </form>
            <ul class="safety">
                <li>${icon(ICONS.shield)}Meet in a busy public place, like a mall.</li>
                <li>${icon(ICONS.shield)}Test the card in a PC before you pay.</li>
                <li>${icon(ICONS.shield)}Never send money before you've seen it.</li>
            </ul>
            <button class="report-link" type="button" id="reportOpen" aria-expanded="false" aria-controls="reportForm">${icon(ICONS.flag)}Report this listing</button>
            <form class="report-form" id="reportForm" hidden novalidate>
                <fieldset>
                    <legend>What's wrong with it?</legend>
                    <div class="choice-row">
                        ${[["scam", "Looks like a scam"], ["wrong_item", "Not what it says"], ["offensive", "Offensive"],
                           ["sold_elsewhere", "Already sold"], ["other", "Something else"]].map(([v, t], i) => `
                            <label class="choice"><input type="radio" name="reason" value="${v}" ${i === 0 ? "checked" : ""}><span>${t}</span></label>`).join("")}
                    </div>
                </fieldset>
                <label class="visually-hidden" for="reportDetails">Details</label>
                <textarea id="reportDetails" rows="2" maxlength="500" placeholder="Anything that helps an admin check it (optional)"></textarea>
                <div class="row-actions">
                    <button class="btn btn-ghost" type="submit">Send report</button>
                    <button class="btn btn-quiet" type="button" id="reportCancel">Cancel</button>
                </div>
            </form>
            <p class="report-done" id="reportDone" role="status" hidden></p>`;

        const reportForm = $("reportForm");
        const setReport = (open) => {
            reportForm.hidden = !open;
            $("reportOpen").setAttribute("aria-expanded", String(open));
            if (open) reportForm.querySelector("input:checked").focus();
        };
        $("reportOpen").addEventListener("click", () => setReport(reportForm.hidden));
        $("reportCancel").addEventListener("click", () => { setReport(false); $("reportOpen").focus(); });
        reportForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const button = e.submitter || e.target.querySelector("[type=submit]");
            button.disabled = true;
            try {
                const done = await send(`/listings/${item.id}/report`, "POST", {
                    reason: reportForm.querySelector("[name=reason]:checked").value,
                    details: $("reportDetails").value.trim(),
                });
                reportForm.hidden = true;
                $("reportOpen").hidden = true;
                $("reportDone").textContent = done.message;
                $("reportDone").hidden = false;
            } catch (error) {
                $("reportDone").textContent = error.message;
                $("reportDone").hidden = false;
                button.disabled = false;
            }
        });
        $("askForm").addEventListener("submit", async (event) => {
            event.preventDefault();
            const body = $("askBody").value.trim();
            const error = $("askError");
            if (!body) {
                error.textContent = "Write a message first.";
                error.hidden = false;
                return;
            }
            // submitter is missing when the form is sent without clicking its button
            const button = event.submitter || event.target.querySelector("[type=submit]");
            button.disabled = true;
            if (!(await saveName("askName"))) {
                button.disabled = false;
                return;
            }
            try {
                const { conversation_id } = await send(`/listings/${item.id}/messages`, "POST", { body });
                go(`#/chat/${conversation_id}`);
            } catch (e) {
                error.textContent = e.message;
                error.hidden = false;
                button.disabled = false;
            }
        });
    }
}


// ============================================
// SELL / EDIT
// ============================================

// Shrink a photo in the browser so uploads stay well under the API's 4 MB
// limit even for 12-megapixel phone shots. Falls back to the original file.
async function shrink(file) {
    try {
        const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
        const scale = Math.min(1, PHOTO_SIDE / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(bitmap.width * scale);
        canvas.height = Math.round(bitmap.height * scale);
        canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close?.();
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
        return blob || file;
    } catch {
        return file;
    }
}

async function uploadPhoto(file) {
    const body = new FormData();
    body.append("file", await shrink(file), "photo.jpg");
    const data = await api("/listings/photos", { method: "POST", body });
    return data.url;
}

async function renderForm(id) {
    const existing = id ? await api(`/listings/${id}`) : null;
    if (existing && !existing.is_mine) throw Object.assign(new Error("You can only edit your own listings."), { status: 403 });

    const state = {
        photos: [...(existing?.photos || [])],   // uploaded URLs, in order; the first is the cover
        uploading: 0,
        gpuId: existing?.gpu_id || null,
    };

    view().innerHTML = `
        <a class="back-link" href="${existing ? `#/listing/${existing.id}` : "#/"}">${icon(ICONS.back)}${existing ? "Back to the listing" : "All listings"}</a>
        <div class="sell-layout">
        <section class="panel form-panel">
            <h1>${existing ? "Edit your listing" : "Sell a GPU"}</h1>
            <p class="muted">${existing ? "Changes show to buyers right away." : "Good photos and an honest condition sell cards fastest."}</p>

            <form id="listingForm" novalidate>
                <fieldset class="field">
                    <legend>Photos <span class="muted">(up to ${MAX_PHOTOS}; the first is the cover)</span></legend>
                    <div class="photo-grid" id="photoGrid"></div>
                    <input type="file" id="photoInput" accept="image/png,image/jpeg,image/webp" multiple class="visually-hidden">
                    <p class="form-error" id="photoError" role="alert" hidden></p>
                </fieldset>

                <div class="field">
                    <label for="title">Title</label>
                    <input id="title" maxlength="120" required placeholder="e.g. ASUS TUF RTX 3080 10GB, complete with box" value="${escapeHTML(existing?.title || "")}">
                    <p class="form-error" data-for="title" hidden></p>
                </div>

                <div class="field">
                    <label for="gpuSearch">Which GPU is it? <span class="muted">(optional; links your listing to its specs)</span></label>
                    <div class="gpu-picker">
                        <input id="gpuSearch" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="gpuOptions" autocomplete="off" placeholder="Search the catalog, e.g. RTX 3080">
                        <ul class="picker-list" id="gpuOptions" role="listbox" aria-label="Catalog GPUs" hidden></ul>
                    </div>
                    <div class="gpu-chosen" id="gpuChosen" hidden></div>
                </div>

                <fieldset class="field">
                    <legend>Condition</legend>
                    <div class="choice-row">${Object.entries(CONDITIONS).map(([k, v]) => `
                        <label class="choice"><input type="radio" name="condition" value="${k}" ${(existing?.condition || "good") === k ? "checked" : ""}><span>${v}</span></label>`).join("")}
                    </div>
                </fieldset>

                <div class="field-row">
                    <div class="field">
                        <label for="price">Price</label>
                        <div class="price-input">
                            <select id="priceCurrency" aria-label="Currency">
                                <option value="PHP" ${(existing?.currency || currency) === "PHP" ? "selected" : ""}>₱ PHP</option>
                                <option value="USD" ${(existing?.currency || currency) === "USD" ? "selected" : ""}>$ USD</option>
                            </select>
                            <input id="price" type="number" inputmode="decimal" min="1" step="any" required placeholder="18500" value="${existing ? escapeHTML(existing.price) : ""}">
                        </div>
                        <p class="form-error" data-for="price" hidden></p>
                    </div>
                    <div class="field">
                        <label for="location">Meet-up area <span class="muted">(city or district)</span></label>
                        <input id="location" maxlength="80" placeholder="e.g. Quezon City" value="${escapeHTML(existing?.location || "")}">
                    </div>
                </div>

                <div class="field">
                    <label for="description">Description <span class="muted">(optional)</span></label>
                    <textarea id="description" rows="5" maxlength="2000" placeholder="How long you used it, any repairs, what's in the box, why you're selling.">${escapeHTML(existing?.description || "")}</textarea>
                </div>

                ${nameField("sellName")}

                <p class="form-error" id="formError" role="alert" hidden></p>
                <div class="row-actions">
                    <button class="btn btn-primary" type="submit" id="saveListing">${existing ? "Save changes" : "Post listing"}</button>
                    <a class="btn btn-quiet" href="${existing ? `#/listing/${existing.id}` : "#/"}">Cancel</a>
                </div>
            </form>
        </section>
        <aside class="sell-preview" aria-label="Preview">
            <p class="preview-label">How buyers will see it</p>
            <div id="previewCard"></div>
        </aside>
        </div>`;

    // ----- live preview of the listing card -----
    const drawPreview = () => {
        const form = $("listingForm");
        const price = Number($("price").value);
        $("previewCard").innerHTML = listingCard({
            id: existing?.id || 0,
            photos: state.photos,
            status: existing?.status || "active",
            price: price > 0 ? price : 0,
            currency: $("priceCurrency").value,
            title: $("title").value.trim() || "Your listing title",
            condition: form.querySelector("[name=condition]:checked")?.value || "good",
            location: $("location").value.trim(),
            seller: { name: profileName || $("sellName")?.value.trim() || "You" },
            created_at: existing?.created_at || new Date().toISOString(),
        }).replace("<a ", '<div tabindex="-1" ').replace(/<\/a>\s*$/, "</div>");
    };

    // ----- photos -----
    const drawPhotos = () => {
        const slots = state.photos.map((url, i) => `
            <div class="photo-slot">
                <img src="${escapeHTML(url)}" alt="Photo ${i + 1}" decoding="async">
                ${i === 0 ? `<span class="cover-tag">Cover</span>` : `<button class="slot-btn make-cover" type="button" data-cover="${i}" aria-label="Make photo ${i + 1} the cover">${icon(ICONS.star)}</button>`}
                <button class="slot-btn remove" type="button" data-remove="${i}" aria-label="Remove photo ${i + 1}">${icon(ICONS.x)}</button>
            </div>`);
        for (let i = 0; i < state.uploading; i++) slots.push(`<div class="photo-slot is-uploading" aria-label="Uploading"><span class="spinner" aria-hidden="true"></span></div>`);
        if (state.photos.length + state.uploading < MAX_PHOTOS) {
            slots.push(`<button class="photo-add" type="button" id="addPhoto">${icon(ICONS.camera)}<span>${state.photos.length ? "Add more" : "Add photos"}</span><small>or drop them here</small></button>`);
        }
        $("photoGrid").innerHTML = slots.join("");
        drawPreview();
        $("addPhoto")?.addEventListener("click", () => $("photoInput").click());
        $("photoGrid").querySelectorAll("[data-remove]").forEach((b) => b.addEventListener("click", () => {
            state.photos.splice(Number(b.dataset.remove), 1);
            drawPhotos();
        }));
        $("photoGrid").querySelectorAll("[data-cover]").forEach((b) => b.addEventListener("click", () => {
            const [moved] = state.photos.splice(Number(b.dataset.cover), 1);
            state.photos.unshift(moved);
            drawPhotos();
        }));
    };

    const addFiles = async (files) => {
        const error = $("photoError");
        error.hidden = true;
        const room = MAX_PHOTOS - state.photos.length - state.uploading;
        const list = [...files].filter((f) => /^image\//.test(f.type));
        if (!list.length) return;
        if (list.length > room) {
            error.textContent = `You can add ${room} more photo${room === 1 ? "" : "s"} (${MAX_PHOTOS} at most).`;
            error.hidden = false;
        }
        const chosen = list.slice(0, room);
        state.uploading += chosen.length;
        drawPhotos();
        await Promise.all(chosen.map(async (file) => {
            try {
                state.photos.push(await uploadPhoto(file));
            } catch (e) {
                error.textContent = `"${file.name}" didn't upload: ${e.message}`;
                error.hidden = false;
            } finally {
                state.uploading--;
                drawPhotos();
            }
        }));
    };

    drawPhotos();
    $("photoInput").addEventListener("change", (e) => { addFiles(e.target.files); e.target.value = ""; });
    const grid = $("photoGrid");
    grid.addEventListener("dragover", (e) => { e.preventDefault(); grid.classList.add("is-dropping"); });
    grid.addEventListener("dragleave", () => grid.classList.remove("is-dropping"));
    grid.addEventListener("drop", (e) => { e.preventDefault(); grid.classList.remove("is-dropping"); addFiles(e.dataTransfer.files); });

    // ----- catalog GPU -----
    const drawChosen = () => {
        const gpu = catalog.find((g) => Number(g.id) === Number(state.gpuId));
        $("gpuChosen").hidden = !gpu;
        $("gpuSearch").closest(".gpu-picker").hidden = Boolean(gpu);
        if (gpu) {
            $("gpuChosen").innerHTML = `
                <span class="gpu-link-photo${gpu.image_url ? "" : " is-missing"}">${gpu.image_url ? `<img src="${escapeHTML(gpu.image_url)}" alt="" decoding="async">` : ""}</span>
                <span><strong>${escapeHTML(gpu.model)}</strong><small>${escapeHTML([gpu.brand, gpu.vram].filter(Boolean).join(" · "))}</small></span>
                <button class="btn btn-quiet" type="button" id="gpuClear">Change</button>`;
            $("gpuClear").addEventListener("click", () => {
                state.gpuId = null;
                drawChosen();
                $("gpuSearch").value = "";
                $("gpuSearch").focus();
            });
        }
    };
    setupPicker($("gpuSearch"), $("gpuOptions"), catalog, (gpu) => {
        state.gpuId = gpu.id;
        if (!$("title").value.trim()) $("title").value = gpu.model;
        drawChosen();
    });
    drawChosen();

    $("listingForm").addEventListener("input", drawPreview);
    $("listingForm").addEventListener("change", drawPreview);

    // ----- save -----
    $("listingForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = $("listingForm");
        form.querySelectorAll(".form-error").forEach((p) => { p.hidden = true; });
        form.querySelectorAll("[aria-invalid]").forEach((el) => el.removeAttribute("aria-invalid"));

        const fieldError = (id, text) => {
            const p = form.querySelector(`[data-for="${id}"]`);
            p.textContent = text;
            p.hidden = false;
            $(id).setAttribute("aria-invalid", "true");
            $(id).setAttribute("aria-describedby", p.id || (p.id = `${id}Error`));
        };
        const title = $("title").value.trim();
        const price = Number($("price").value);
        let bad = null;
        if (title.length < 3) { fieldError("title", "Give it a title of at least 3 characters."); bad ||= "title"; }
        if (!(price > 0)) { fieldError("price", "Enter a price above zero."); bad ||= "price"; }
        if (state.uploading) {
            $("formError").textContent = "Wait for your photos to finish uploading.";
            $("formError").hidden = false;
            return;
        }
        if (bad) return $(bad).focus();

        const body = {
            title,
            description: $("description").value.trim(),
            condition: form.querySelector("[name=condition]:checked").value,
            price,
            currency: $("priceCurrency").value,
            location: $("location").value.trim(),
            photos: state.photos,
            gpu_id: state.gpuId ? Number(state.gpuId) : null,
        };
        const button = $("saveListing");
        if (!(await saveName("sellName"))) return;
        button.disabled = true;
        button.textContent = existing ? "Saving…" : "Posting…";
        try {
            const saved = existing
                ? await send(`/listings/${existing.id}`, "PATCH", body)
                : await send("/listings", "POST", body);
            go(`#/listing/${saved.id}`);
        } catch (e) {
            $("formError").textContent = e.message;
            $("formError").hidden = false;
            button.disabled = false;
            button.textContent = existing ? "Save changes" : "Post listing";
        }
    });
}

// Type-to-search over the catalog (the same picker as GPU Guessr's Daily).
function setupPicker(input, list, items, onPick) {
    const norm = (t) => String(t ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    let shown = [];
    let active = -1;
    const close = () => {
        list.hidden = true;
        input.setAttribute("aria-expanded", "false");
        input.removeAttribute("aria-activedescendant");
        active = -1;
    };
    const highlight = (i) => {
        active = i;
        list.querySelectorAll("[role=option]").forEach((li, j) => li.setAttribute("aria-selected", String(j === i)));
        if (i >= 0) input.setAttribute("aria-activedescendant", `${list.id}-${i}`);
    };
    const open = () => {
        const words = norm(input.value).split(" ").filter(Boolean);
        if (!words.length) return close();
        shown = items.filter((g) => {
            const hay = norm(`${g.brand} ${g.model} ${g.series}`);
            return words.every((w) => hay.includes(w));
        }).slice(0, 8);
        list.innerHTML = shown.length
            ? shown.map((g, i) => `
                <li class="picker-option" id="${list.id}-${i}" role="option" aria-selected="false" data-i="${i}">
                    <span class="picker-photo${g.image_url ? "" : " is-missing"}">${g.image_url ? `<img src="${escapeHTML(g.image_url)}" alt="" decoding="async">` : ""}</span>
                    <span class="picker-text"><strong>${escapeHTML(g.model)}</strong><small>${escapeHTML([g.brand, listingYear(g), g.vram].filter(Boolean).join(" · "))}</small></span>
                </li>`).join("")
            : `<li class="picker-empty" role="option" aria-disabled="true">Not in the catalog. That's fine: leave this empty.</li>`;
        list.hidden = false;
        input.setAttribute("aria-expanded", "true");
        highlight(shown.length ? 0 : -1);
    };
    const choose = (i) => {
        const gpu = shown[i];
        if (!gpu) return;
        close();
        onPick(gpu);
    };
    input.addEventListener("input", open);
    input.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if (list.hidden) return open();
            highlight((active + (e.key === "ArrowDown" ? 1 : -1) + shown.length) % Math.max(1, shown.length));
        } else if (e.key === "Enter" && !list.hidden && active >= 0) {
            e.preventDefault();
            choose(active);
        } else if (e.key === "Escape") {
            close();
        }
    });
    list.addEventListener("pointerdown", (e) => {
        const li = e.target.closest("[data-i]");
        if (!li) return;
        e.preventDefault();
        choose(Number(li.dataset.i));
    });
    input.addEventListener("blur", () => setTimeout(close, 120));
}


// ============================================
// MY LISTINGS
// ============================================

async function renderMine() {
    const data = await api("/listings?mine=true");
    const active = data.listings.filter((l) => l.status === "active");
    const sold = data.listings.filter((l) => l.status === "sold");
    view().innerHTML = `
        <section class="browse-head">
            <div>
                <h1>My listings</h1>
                <p>${active.length} for sale · ${sold.length} sold</p>
            </div>
        </section>
        ${data.listings.length ? `
            <div class="listing-grid">${[...active, ...sold].map(listingCard).join("")}</div>` : `
            <div class="empty">
                ${icon(ICONS.camera, "icon empty-icon")}
                <h2>You haven't listed anything yet</h2>
                <p>Add a few photos, a price and where you can meet. It takes about a minute.</p>
                <a class="btn btn-primary" href="#/sell">Sell a GPU</a>
            </div>`}`;
}


// ============================================
// INBOX AND CHAT
// ============================================

async function renderInbox() {
    const data = await api("/me/conversations");
    refreshUnread();
    view().innerHTML = `
        <section class="browse-head">
            <div>
                <h1>Inbox</h1>
                <p>${data.conversations.length ? `${data.unread ? `${data.unread} unread · ` : ""}Messages about what you're buying and selling.` : "Messages about what you're buying and selling show up here."}</p>
            </div>
        </section>
        ${data.conversations.length ? `
            <ul class="inbox">${data.conversations.map((c) => `
                <li>
                    <a class="inbox-row${c.unread ? " is-unread" : ""}" href="#/chat/${c.id}">
                        <span class="inbox-photo${c.listing.cover ? "" : " is-missing"}">${c.listing.cover ? `<img src="${escapeHTML(c.listing.cover)}" alt="" loading="lazy" decoding="async">` : ""}</span>
                        <span class="inbox-text">
                            <span class="inbox-top">
                                <strong>${escapeHTML(c.with.name)}</strong>
                                <span class="role-tag">${c.role === "buying" ? "Buying" : "Selling"}</span>
                                <time>${escapeHTML(timeAgo(c.last_message_at))}</time>
                            </span>
                            <span class="inbox-listing">${escapeHTML(c.listing.title)}${c.listing.price != null ? ` · ${escapeHTML(priceText(c.listing.price, c.listing.currency))}` : ""}</span>
                            <span class="inbox-last">${c.last_from_me ? "You: " : ""}${escapeHTML(c.last_body)}</span>
                        </span>
                        ${c.unread ? `<span class="unread-dot" aria-label="Unread"></span>` : ""}
                    </a>
                </li>`).join("")}
            </ul>` : `
            <div class="empty">
                ${icon(ICONS.send, "icon empty-icon")}
                <h2>No messages yet</h2>
                <p>Open a listing and message the seller, or wait for buyers to message you.</p>
                <a class="btn btn-primary" href="#/">Browse listings</a>
            </div>`}`;
}

async function renderChat(id) {
    let data = await api(`/conversations/${id}`);
    refreshUnread();

    view().innerHTML = `
        <a class="back-link" href="#/inbox">${icon(ICONS.back)}Inbox</a>
        <section class="chat">
            <a class="chat-head" href="#/listing/${data.listing.id}">
                <span class="inbox-photo${data.listing.cover ? "" : " is-missing"}">${data.listing.cover ? `<img src="${escapeHTML(data.listing.cover)}" alt="" decoding="async">` : ""}</span>
                <span>
                    <strong>${escapeHTML(data.listing.title)}</strong>
                    <small>${data.role === "buying" ? "Seller" : "Buyer"}: ${escapeHTML(data.with.name)}${data.listing.price != null ? ` · ${escapeHTML(priceText(data.listing.price, data.listing.currency))}` : ""}${data.listing.status === "sold" ? " · Sold" : ""}</small>
                </span>
            </a>
            <ol class="thread" id="thread" aria-label="Messages"></ol>
            <form class="composer" id="composer" novalidate>
                <label class="visually-hidden" for="reply">Your message</label>
                <textarea id="reply" rows="1" maxlength="2000" placeholder="Write a message"></textarea>
                <button class="btn btn-primary" type="submit" aria-label="Send">${icon(ICONS.send)}</button>
            </form>
            <p class="form-error" id="chatError" role="alert" hidden></p>
        </section>`;

    const thread = $("thread");
    const draw = () => {
        const nearBottom = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 80;
        const firstNew = draw.done ? (draw.count ?? data.messages.length) : data.messages.length;
        thread.innerHTML = data.messages.map((m, i) => `
            <li class="bubble${m.mine ? " is-mine" : ""}${i >= firstNew ? " is-new" : ""}">
                <p>${escapeHTML(m.body)}</p>
                <time datetime="${escapeHTML(m.created_at)}">${escapeHTML(timeAgo(m.created_at))}</time>
            </li>`).join("");
        if (nearBottom || !draw.done) thread.scrollTop = thread.scrollHeight;
        draw.done = true;
        draw.count = data.messages.length;
    };
    draw();

    const reply = $("reply");
    reply.addEventListener("input", () => {
        reply.style.height = "auto";
        reply.style.height = `${Math.min(reply.scrollHeight, 160)}px`;
    });
    // Enter sends, Shift+Enter makes a new line
    reply.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            $("composer").requestSubmit();
        }
    });
    $("composer").addEventListener("submit", async (e) => {
        e.preventDefault();
        const body = reply.value.trim();
        if (!body) return;
        const button = $("composer").querySelector("button");
        button.disabled = true;
        try {
            const message = await send(`/conversations/${id}/messages`, "POST", { body });
            data.messages.push(message);
            reply.value = "";
            reply.style.height = "auto";
            $("chatError").hidden = true;
            thread.scrollTop = thread.scrollHeight;
            draw();
        } catch (error) {
            $("chatError").textContent = error.message;
            $("chatError").hidden = false;
        } finally {
            button.disabled = false;
            reply.focus();
        }
    });
    reply.focus({ preventScroll: true });

    // new messages from the other side, while the chat is open
    const timer = setInterval(async () => {
        if (document.hidden) return;
        try {
            const fresh = await api(`/conversations/${id}`);
            if (fresh.messages.length !== data.messages.length) {
                data = fresh;
                draw();
            }
        } catch {
            // try again on the next tick
        }
    }, CHAT_POLL_MS);
    stopChatPoll = () => clearInterval(timer);
}


// ============================================
// START
// ============================================

async function setup() {
    try {
        account = await requireSignIn();
    } catch (error) {
        document.documentElement.classList.remove("auth-checking");
        view().innerHTML = `<section class="panel notice is-error" role="alert"><h1>Can't open the Marketplace</h1><p>${escapeHTML(error.message)} Refresh the page to try again.</p></section>`;
        return;
    }
    if (!account) return;
    document.documentElement.classList.remove("auth-checking");

    try {
        profileName = (await api("/me/profile")).display_name;
    } catch {
        profileName = null;   // asked for again when it's needed
    }
    setupMenu();
    setupCurrency();
    try {
        const data = await api("/gpus");
        catalog = Array.isArray(data) ? data : data.gpus || [];
    } catch {
        catalog = [];   // listings still work; only linking a catalog GPU is off
    }
    window.addEventListener("hashchange", route);
    route();
    refreshUnread();
    setInterval(() => !document.hidden && refreshUnread(), UNREAD_POLL_MS);
}

setup();
