const state = {
  recipes: [],
  filtered: [],
  current: null,
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
};

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

const GITHUB_OWNER = "coeyn";
const GITHUB_REPO = "mes_recettes";
const GITHUB_BRANCH = "";

const fetchGithubDefaultBranch = async () => {
  const response = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`);
  if (!response.ok) return null;
  const data = await response.json();
  return data.default_branch || null;
};

const discoverRecipeFiles = async () => {
  const branch = GITHUB_BRANCH || (await fetchGithubDefaultBranch()) || "main";
  const response = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/recettes?ref=${branch}`
  );
  if (!response.ok) {
    throw new Error("Impossible de charger la liste des recettes.");
  }
  const items = await response.json();
  const files = (Array.isArray(items) ? items : [])
    .filter((item) => item.type === "file" && item.name.endsWith(".json"))
    .filter((item) => item.name !== "recettes.json")
    .map((item) => item.name)
    .sort();
  if (!files.length) {
    throw new Error("Aucune recette trouvee dans le dossier recettes.");
  }
  return files;
};

const loadRecipes = async () => {
  const files = await discoverRecipeFiles();
  const data = await Promise.all(files.map(fetchRecipe));
  state.recipes = data;
  state.filtered = data;
  renderList();
  const currentId = window.location.hash.replace("#", "");
  if (currentId) {
    showRecipe(currentId);
  }
};

const renderList = () => {
  elements.grid.innerHTML = "";
  if (!state.filtered.length) {
    elements.emptyState.classList.remove("hidden");
  } else {
    elements.emptyState.classList.add("hidden");
  }
  state.filtered.forEach((recipe) => {
    const card = document.createElement("article");
    card.className = "card";
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `Ouvrir ${recipe.titre}`);
    card.innerHTML = `
      <h2>${recipe.titre}</h2>
      <div class="badges">
        ${(recipe.tags || []).map((tag) => `<span class="badge">${tag}</span>`).join("")}
      </div>
      <div class="meta">
        <span>${formatMinutes(recipe.temps?.preparation_minutes)} preparation</span>
        <span>${formatMinutes(recipe.temps?.cuisson_minutes)} cuisson</span>
        <span>${recipe.portions ?? "?"} portions</span>
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
            `<li>${formatQuantity(item)}${formatCalories(item) ? ` <em>(${formatCalories(item)})</em>` : ""}</li>`
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
            `<li>${formatQuantity(item)}${formatCalories(item) ? ` <em>(${formatCalories(item)})</em>` : ""}</li>`
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

  elements.detailContent.innerHTML = `
    <div>
      <h2>${recipe.titre}</h2>
      <div class="badges">
        ${(recipe.saison || []).map((item) => `<span class="badge">${item}</span>`).join("")}
        ${(recipe.tags || []).map((item) => `<span class="badge">${item}</span>`).join("")}
      </div>
      <div class="meta">
        <span>${formatMinutes(recipe.temps?.preparation_minutes)} preparation</span>
        <span>${formatMinutes(recipe.temps?.cuisson_minutes)} cuisson</span>
        <span>${totalMinutes} min total</span>
        <span>${recipe.portions ?? "?"} portions</span>
      </div>
    </div>
    <div class="detail-section">
      <h3>Ingredients</h3>
      <div class="detail">${ingredientSections}</div>
    </div>
    ${optionsSections ? `<div class="detail-section"><h3>Options</h3><div class="detail">${optionsSections}</div></div>` : ""}
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
  `;
};

const showRecipe = (id) => {
  const recipe = state.recipes.find((item) => item.id === id);
  if (!recipe) return;
  state.current = recipe;
  renderDetail(recipe);
  elements.listView.classList.remove("active");
  elements.detailView.classList.add("active");
  window.location.hash = id;
};

const showList = () => {
  elements.detailView.classList.remove("active");
  elements.listView.classList.add("active");
  state.current = null;
  if (window.location.hash) {
    history.replaceState(null, "", window.location.pathname);
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

window.addEventListener("hashchange", () => {
  const id = window.location.hash.replace("#", "");
  if (id) {
    showRecipe(id);
  } else {
    showList();
  }
});

elements.backButton.addEventListener("click", showList);

elements.search.addEventListener("input", applyFilter);

loadRecipes().catch((error) => {
  elements.grid.innerHTML = `<p>${error.message}</p>`;
});
