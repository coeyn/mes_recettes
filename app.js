const state = {
  recipes: [],
  filtered: [],
  current: null,
  plan: {
    items: [],
  },
};

const elements = {
  listView: document.querySelector("#list-view"),
  detailView: document.querySelector("#detail-view"),
  grid: document.querySelector("#recipe-grid"),
  count: document.querySelector("#recipe-count"),
  detailContent: document.querySelector("#detail-content"),
  backButton: document.querySelector("#back-button"),
  search: document.querySelector("#search"),
  emptyState: document.querySelector("#empty-state"),
  plannerView: document.querySelector("#planner-view"),
  plannerLink: document.querySelector("#planner-link"),
  plannerBack: document.querySelector("#planner-back"),
  authView: document.querySelector("#auth-view"),
  authLink: document.querySelector("#auth-link"),
  authBack: document.querySelector("#auth-back"),
  authGoPlanner: document.querySelector("#auth-go-planner"),
  searchForm: document.querySelector("#search-form"),
  plannerSelect: document.querySelector("#planner-select"),
  plannerAdd: document.querySelector("#planner-add"),
  plannerItems: document.querySelector("#planner-items"),
  shoppingList: document.querySelector("#shopping-list"),
  shoppingEmpty: document.querySelector("#shopping-empty"),
  authStatus: document.querySelector("#auth-status"),
  authForm: document.querySelector("#auth-form"),
  authEmail: document.querySelector("#auth-email"),
  authPassword: document.querySelector("#auth-password"),
  authLogin: document.querySelector("#auth-login"),
  authRegister: document.querySelector("#auth-register"),
  authLogout: document.querySelector("#auth-logout"),
};

const PLAN_STORAGE_KEY = "mealPlanner";
let firebaseApp = null;
let auth = null;
let db = null;
let currentUser = null;
let unsubscribePlan = null;
let saveTimeout = null;

const formatMinutes = (minutes) => {
  if (typeof minutes !== "number") return "";
  return `${minutes} min`;
};

const formatQuantity = (item) => {
  const qty = item.quantite ?? item.quantite_par_personne ?? null;
  const unit = item.unite ?? "";
  const type = item.type ? ` (${item.type})` : "";
  if (qty === null) return item.nom;
  return `${item.nom}${type} - ${qty} ${unit}`.trim();
};

const ingredientEmojiMap = [
  { match: ["poireau", "poireaux"], emoji: "🧅" },
  { match: ["pomme de terre", "pommes de terre"], emoji: "🥔" },
  { match: ["tomate", "tomates"], emoji: "🍅" },
  { match: ["oignon", "oignons"], emoji: "🧅" },
  { match: ["ail"], emoji: "🧄" },
  { match: ["oeuf", "œuf", "oeufs", "œufs"], emoji: "🥚" },
  { match: ["fromage", "feta"], emoji: "🧀" },
  { match: ["yaourt", "yogourt"], emoji: "🥛" },
  { match: ["poulet"], emoji: "🍗" },
  { match: ["lardon", "lardons", "bacon"], emoji: "🥓" },
  { match: ["riz"], emoji: "🍚" },
  { match: ["pate", "pates", "pâte", "pâtes"], emoji: "🍝" },
  { match: ["pain"], emoji: "🍞" },
  { match: ["citron"], emoji: "🍋" },
  { match: ["huile", "huile d'olive", "huile d’olive"], emoji: "🫒" },
  { match: ["poivre", "sel", "epice", "épice", "moutarde"], emoji: "🧂" },
  { match: ["poivron", "poivrons"], emoji: "🫑" },
  { match: ["carotte", "carottes"], emoji: "🥕" },
  { match: ["champignon", "champignons"], emoji: "🍄" },
  { match: ["courgette", "courgettes"], emoji: "🥒" },
  { match: ["lentille", "lentilles"], emoji: "🥣" },
  { match: ["haricot", "haricots", "pois chiche", "pois chiches"], emoji: "🫘" },
  { match: ["poisson"], emoji: "🐟" },
  { match: ["crevette", "crevettes"], emoji: "🦐" },
  { match: ["boeuf", "bœuf"], emoji: "🥩" },
  { match: ["porc"], emoji: "🐖" },
];

const normalizeIngredient = (value) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const emojiForIngredient = (name) => {
  const normalized = normalizeIngredient(name);
  const entry = ingredientEmojiMap.find((item) =>
    item.match.some((term) => normalized.includes(normalizeIngredient(term)))
  );
  return entry ? `${entry.emoji} ` : "";
};

const formatCalories = (item) => {
  const calories = item.calories ?? item.calories_total ?? item.calories_par_personne ?? null;
  if (calories === null) return "";
  return `${calories} kcal`;
};

const normalize = (value) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const fetchRecipe = async (file) => {
  const response = await fetch(`recettes/${file}`);
  if (!response.ok) {
    throw new Error(`Impossible de charger ${file}`);
  }
  return response.json();
};

const fetchRecipeList = async () => {
  const response = await fetch("recettes/recettes.json");
  if (!response.ok) {
    throw new Error("Impossible de charger la liste des recettes.");
  }
  return response.json();
};

const loadRecipes = async () => {
  const files = await fetchRecipeList();
  const data = await Promise.all(files.map(fetchRecipe));
  state.recipes = data;
  state.filtered = data;
  renderList();
  renderPlannerSelect();
  loadPlanFromStorage();
  handleHashChange();
};

const renderList = () => {
  elements.grid.innerHTML = "";
  if (!state.filtered.length) {
    elements.emptyState.classList.remove("hidden");
  } else {
    elements.emptyState.classList.add("hidden");
  }
  state.filtered.forEach((recipe) => {
    const baseCalories =
      recipe.calories?.base_par_personne ??
      recipe.calories?.sans_feculent_par_personne ??
      null;
    const totalMinutes =
      (recipe.temps?.preparation_minutes ?? 0) + (recipe.temps?.cuisson_minutes ?? 0);
    const card = document.createElement("article");
    card.className = "card";
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `Ouvrir ${recipe.titre}`);
    card.innerHTML = `
      <h2>${recipe.titre}</h2>
      <div class="badges">
        ${(recipe.saison || []).map((s) => `<span class="badge sun">${s}</span>`).join("")}
        ${(recipe.tags || []).map((tag) => `<span class="badge">${tag}</span>`).join("")}
      </div>
      <div class="meta">
        <span><strong>${formatMinutes(totalMinutes)}</strong> total</span>
        <span>${recipe.portions ?? "?"} portions</span>
        ${baseCalories ? `<span><strong>${baseCalories}</strong> kcal/pers</span>` : ""}
      </div>
      <div class="card-stats">
        <span class="stat-pill">${formatMinutes(recipe.temps?.preparation_minutes)} prep</span>
        <span class="stat-pill">${formatMinutes(recipe.temps?.cuisson_minutes)} cuisson</span>
      </div>
    `;
    card.addEventListener("click", () => showRecipe(recipe.id));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter") showRecipe(recipe.id);
    });
    elements.grid.appendChild(card);
  });
  elements.count.textContent = `${state.filtered.length} recette${state.filtered.length > 1 ? "s" : ""}`;
};

const renderDetail = (recipe) => {
  const totalMinutes =
    (recipe.temps?.preparation_minutes ?? 0) + (recipe.temps?.cuisson_minutes ?? 0);

  const ingredientSections = Object.entries(recipe.ingredients || {})
    .map(([label, items]) => {
      const lines = items
        .map(
          (item) =>
            `<li>${emojiForIngredient(item.nom)}${formatQuantity(item)}${formatCalories(item) ? ` <em>(${formatCalories(item)})</em>` : ""}</li>`
        )
        .join("");
      return `
        <div class="detail-section">
          <h3>${label.replace(/_/g, " ")}</h3>
          <ul class="list">${lines}</ul>
        </div>
      `;
    })
    .join("");

  const optionsSections = Object.entries(recipe.options || {})
    .map(([label, items]) => {
      const lines = items
        .map(
          (item) =>
            `<li>${emojiForIngredient(item.nom)}${formatQuantity(item)}${formatCalories(item) ? ` <em>(${formatCalories(item)})</em>` : ""}</li>`
        )
        .join("");
      return `
        <div class="detail-section">
          <h3>${label.replace(/_/g, " ")}</h3>
          <ul class="list">${lines}</ul>
        </div>
      `;
    })
    .join("");

  const steps = (recipe.etapes || [])
    .map((step, index) => {
      if (typeof step === "string") {
        return `<li><strong>Etape ${index + 1}.</strong> ${step}</li>`;
      }
      return `<li><strong>Etape ${step.ordre}.</strong> ${step.description}</li>`;
    })
    .join("");

  const baseCalories =
    recipe.calories?.base_par_personne ?? recipe.calories?.sans_feculent_par_personne ?? null;

  elements.detailContent.innerHTML = `
    <div class="detail-header">
      <div class="detail-title">
        <h2>${recipe.titre}</h2>
        <div class="badges">
          ${(recipe.saison || []).map((item) => `<span class="badge sun">${item}</span>`).join("")}
          ${(recipe.tags || []).map((item) => `<span class="badge">${item}</span>`).join("")}
        </div>
      </div>
      <div class="detail-stats">
        <div class="stat-card">
          <span class="stat-label">Preparation</span>
          <strong>${formatMinutes(recipe.temps?.preparation_minutes)}</strong>
        </div>
        <div class="stat-card">
          <span class="stat-label">Cuisson</span>
          <strong>${formatMinutes(recipe.temps?.cuisson_minutes)}</strong>
        </div>
        <div class="stat-card">
          <span class="stat-label">Total</span>
          <strong>${formatMinutes(totalMinutes)}</strong>
        </div>
        <div class="stat-card">
          <span class="stat-label">Portions</span>
          <strong>${recipe.portions ?? "?"}</strong>
        </div>
        ${baseCalories ? `<div class="stat-card">
          <span class="stat-label">Calories</span>
          <strong>${baseCalories} kcal</strong>
        </div>` : ""}
      </div>
    </div>
    <div class="detail-layout">
      <div class="detail-main">
        <div class="detail-section">
          <h3>Ingredients</h3>
          <div class="detail-group">${ingredientSections}</div>
        </div>
        ${optionsSections ? `<div class="detail-section"><h3>Options</h3><div class="detail-group">${optionsSections}</div></div>` : ""}
      </div>
      <div class="detail-side">
        <div class="detail-section">
          <h3>Etapes</h3>
          <ol class="list">${steps}</ol>
        </div>
        <div class="detail-section">
          <h3>Calories</h3>
          <p>Sans feculent : ${recipe.calories?.base_par_personne ?? recipe.calories?.sans_feculent_par_personne ?? "?"} kcal / personne</p>
          <p>Avec feculent :
            ${(recipe.calories?.avec_feculent || recipe.calories?.avec_feculent_par_personne
              ? Object.entries(recipe.calories.avec_feculent ?? recipe.calories.avec_feculent_par_personne)
                  .map(([label, value]) => `${label} ${value} kcal`)
                  .join(" | ")
              : "?")}
          </p>
        </div>
      </div>
    </div>
  `;
};

const showRecipe = (id) => {
  const recipe = state.recipes.find((item) => item.id === id);
  if (!recipe) return;
  state.current = recipe;
  renderDetail(recipe);
  elements.listView.classList.remove("active");
  elements.detailView.classList.add("active");
  elements.plannerView.classList.remove("active");
  elements.authView.classList.remove("active");
  window.location.hash = id;
};

const showList = () => {
  elements.detailView.classList.remove("active");
  elements.listView.classList.add("active");
  elements.plannerView.classList.remove("active");
  elements.authView.classList.remove("active");
  state.current = null;
  if (window.location.hash) {
    history.replaceState(null, "", window.location.pathname);
  }
};

const showPlanner = () => {
  elements.listView.classList.remove("active");
  elements.detailView.classList.remove("active");
  elements.plannerView.classList.add("active");
  elements.authView.classList.remove("active");
  window.location.hash = "plan";
  renderPlannerItems();
  renderShoppingList();
};

const showAuth = () => {
  elements.listView.classList.remove("active");
  elements.detailView.classList.remove("active");
  elements.plannerView.classList.remove("active");
  elements.authView.classList.add("active");
  window.location.hash = "login";
};

const handleHashChange = () => {
  const id = window.location.hash.replace("#", "");
  if (id === "plan") {
    showPlanner();
    return;
  }
  if (id === "login") {
    showAuth();
    return;
  }
  if (id) {
    showRecipe(id);
  } else {
    showList();
  }
};

const applyFilter = () => {
  const value = normalize(elements.search.value || "");
  if (!value) {
    state.filtered = state.recipes;
  } else {
    state.filtered = state.recipes.filter((recipe) => {
      const haystack = [recipe.titre, ...(recipe.tags || []), ...(recipe.saison || [])]
        .filter(Boolean)
        .map(normalize)
        .join(" ");
      return haystack.includes(value);
    });
  }
  renderList();
};

const savePlanToStorage = () => {
  localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(state.plan));
};

const loadPlanFromStorage = () => {
  const raw = localStorage.getItem(PLAN_STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.items)) {
      state.plan = parsed;
    }
  } catch (error) {
    console.warn("Impossible de charger le planning.", error);
  }
};

const updateAuthUI = () => {
  if (!elements.authStatus) return;
  if (currentUser) {
    elements.authStatus.textContent = `Connecte : ${currentUser.email}`;
    elements.authForm.classList.add("hidden");
    elements.authLogout.classList.remove("hidden");
    if (elements.authLink) {
      elements.authLink.textContent = "Compte";
      elements.authLink.classList.add("is-auth");
    }
  } else {
    elements.authStatus.textContent = "Non connecte.";
    elements.authForm.classList.remove("hidden");
    elements.authLogout.classList.add("hidden");
    if (elements.authLink) {
      elements.authLink.textContent = "Connexion";
      elements.authLink.classList.remove("is-auth");
    }
  }
};

const getPlanDocRef = () => db.collection("plannings").doc(currentUser.uid);

const syncPlanOnLogin = async () => {
  if (!db || !currentUser) return;
  try {
    const docRef = getPlanDocRef();
    const doc = await docRef.get();
    if (!doc.exists) {
      await docRef.set(state.plan);
      return;
    }
    const data = doc.data();
    if (data && Array.isArray(data.items)) {
      state.plan = { items: data.items };
      savePlanToStorage();
      renderPlannerItems();
      renderShoppingList();
    }
  } catch (error) {
    console.error("Erreur de synchronisation.", error);
  }
};

const detachPlanListener = () => {
  if (unsubscribePlan) {
    unsubscribePlan();
    unsubscribePlan = null;
  }
};

const attachPlanListener = () => {
  detachPlanListener();
  if (!db || !currentUser) return;
  unsubscribePlan = getPlanDocRef().onSnapshot((doc) => {
    const data = doc.data();
    if (!data || !Array.isArray(data.items)) return;
    const incoming = { items: data.items };
    if (JSON.stringify(incoming) === JSON.stringify(state.plan)) return;
    state.plan = incoming;
    savePlanToStorage();
    renderPlannerItems();
    renderShoppingList();
  });
};

const initFirebase = () => {
  if (typeof firebase === "undefined") {
    elements.authStatus.textContent = "Firebase indisponible.";
    elements.authForm.classList.add("hidden");
    return;
  }
  if (!window.firebaseConfig || !window.firebaseConfig.apiKey) {
    elements.authStatus.textContent = "Firebase non configure.";
    elements.authForm.classList.add("hidden");
    return;
  }
  firebaseApp = firebase.initializeApp(window.firebaseConfig);
  auth = firebase.auth();
  db = firebase.firestore();
  auth.onAuthStateChanged((user) => {
    currentUser = user;
    updateAuthUI();
    if (user) {
      syncPlanOnLogin().then(attachPlanListener);
    } else {
      detachPlanListener();
    }
  });
  updateAuthUI();
};

const persistPlan = () => {
  if (currentUser && db) {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
      try {
        await getPlanDocRef().set(state.plan);
      } catch (error) {
        console.error("Erreur d'enregistrement.", error);
        savePlanToStorage();
      }
    }, 300);
    return;
  }
  savePlanToStorage();
};

const renderPlannerSelect = () => {
  elements.plannerSelect.innerHTML = "";
  state.recipes.forEach((recipe) => {
    const option = document.createElement("option");
    option.value = recipe.id;
    option.textContent = recipe.titre;
    elements.plannerSelect.appendChild(option);
  });
};

const getPlanItem = (id) => state.plan.items.find((item) => item.id === id);

const createPlanItem = (recipe) => ({
  id: recipe.id,
  servings: recipe.portions ?? 2,
});

const addToPlan = (recipeId) => {
  const recipe = state.recipes.find((item) => item.id === recipeId);
  if (!recipe) return;
  const existing = getPlanItem(recipeId);
  if (existing) {
    existing.servings += recipe.portions ?? 1;
  } else {
    state.plan.items.push(createPlanItem(recipe));
  }
  persistPlan();
  renderPlannerItems();
  renderShoppingList();
};

const removeFromPlan = (recipeId) => {
  state.plan.items = state.plan.items.filter((item) => item.id !== recipeId);
  persistPlan();
  renderPlannerItems();
  renderShoppingList();
};

const updateServings = (recipeId, value) => {
  const item = getPlanItem(recipeId);
  if (!item) return;
  const servings = Number(value);
  item.servings = Number.isFinite(servings) && servings > 0 ? servings : 1;
  persistPlan();
  renderShoppingList();
};

const renderPlannerItems = () => {
  elements.plannerItems.innerHTML = "";
  if (!state.plan.items.length) {
    elements.plannerItems.innerHTML = "<p>Aucune recette ajoutee pour le moment.</p>";
    return;
  }
  state.plan.items.forEach((item) => {
    const recipe = state.recipes.find((entry) => entry.id === item.id);
    if (!recipe) return;
    const container = document.createElement("div");
    container.className = "planner-item";
    container.innerHTML = `
      <h3>${recipe.titre}</h3>
      <div class="planner-row">
        <label>Portions</label>
        <input type="number" min="1" value="${item.servings}" data-servings />
        <button class="ghost-button" data-remove>Retirer</button>
      </div>
    `;
    container.querySelector("[data-servings]").addEventListener("input", (event) => {
      updateServings(recipe.id, event.target.value);
    });
    const removeButton = container.querySelector("[data-remove]");
    removeButton.addEventListener("click", () => removeFromPlan(recipe.id));
    elements.plannerItems.appendChild(container);
  });
};

const formatAmount = (value) => {
  if (Number.isInteger(value)) return `${value}`;
  return value.toFixed(1).replace(/\.0$/, "");
};

const addIngredient = (bucket, item, servings, recipePortions) => {
  const unit = item.unite ?? "";
  const name = item.nom;
  const key = `${name}__${unit}`;
  const perPerson = item.quantite_par_personne ?? null;
  const baseQty = item.quantite ?? null;
  let quantity = null;
  if (perPerson !== null) {
    quantity = perPerson * servings;
  } else if (baseQty !== null) {
    const ratio = recipePortions ? servings / recipePortions : 1;
    quantity = baseQty * ratio;
  }
  const existing = bucket.get(key);
  if (!existing) {
    bucket.set(key, { name, unit, quantity });
    return;
  }
  if (quantity === null) {
    return;
  }
  if (existing.quantity === null) {
    existing.quantity = quantity;
    return;
  }
  existing.quantity += quantity;
};

const renderShoppingList = () => {
  const bucket = new Map();
  state.plan.items.forEach((item) => {
    const recipe = state.recipes.find((entry) => entry.id === item.id);
    if (!recipe) return;
    const servings = item.servings ?? recipe.portions ?? 1;
    const portions = recipe.portions ?? 1;
    Object.values(recipe.ingredients || {}).forEach((items) => {
      items.forEach((ingredient) => addIngredient(bucket, ingredient, servings, portions));
    });
  });
  elements.shoppingList.innerHTML = "";
  const lines = Array.from(bucket.values()).sort((a, b) => a.name.localeCompare(b.name));
  if (!lines.length) {
    elements.shoppingEmpty.classList.remove("hidden");
    return;
  }
  elements.shoppingEmpty.classList.add("hidden");
  lines.forEach((entry) => {
    const line = document.createElement("li");
    if (entry.quantity === null || entry.quantity === undefined) {
      line.textContent = entry.name;
    } else {
      const amount = formatAmount(entry.quantity);
      line.textContent = `${entry.name} - ${amount} ${entry.unit}`.trim();
    }
    elements.shoppingList.appendChild(line);
  });
};

window.addEventListener("hashchange", handleHashChange);

elements.backButton.addEventListener("click", showList);
elements.plannerBack.addEventListener("click", showList);
elements.plannerLink.addEventListener("click", showPlanner);
elements.authBack.addEventListener("click", showList);
elements.authLink.addEventListener("click", showAuth);
elements.authGoPlanner.addEventListener("click", showPlanner);

const runSearch = (event) => {
  if (event) event.preventDefault();
  const value = elements.search.value || "";
  if (value.includes("@")) {
    elements.search.value = "";
  }
  applyFilter();
};

if (elements.searchForm) {
  elements.searchForm.addEventListener("submit", runSearch);
}

elements.plannerAdd.addEventListener("click", () => {
  addToPlan(elements.plannerSelect.value);
});

elements.authLogin.addEventListener("click", async () => {
  if (!auth) return;
  const email = elements.authEmail.value.trim();
  const password = elements.authPassword.value.trim();
  if (!email || !password) return;
  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (error) {
    alert("Connexion impossible.");
    console.error(error);
  }
});

elements.authRegister.addEventListener("click", async () => {
  if (!auth) return;
  const email = elements.authEmail.value.trim();
  const password = elements.authPassword.value.trim();
  if (!email || !password) return;
  try {
    await auth.createUserWithEmailAndPassword(email, password);
  } catch (error) {
    alert("Creation de compte impossible.");
    console.error(error);
  }
});

elements.authLogout.addEventListener("click", async () => {
  if (!auth) return;
  await auth.signOut();
});

initFirebase();
loadRecipes().catch((error) => {
  elements.grid.innerHTML = `<p>${error.message}</p>`;
});
