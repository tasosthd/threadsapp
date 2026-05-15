let userSearchQuery = "";
let userSearchReady = false;
let userSearchDataLoaded = false;

function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/^@+/, "");
}

function getProfileDisplayName(profile) {
  return profile?.full_name || profile?.username || "Loomyva User";
}

function getProfileUsernameLabel(profile) {
  if (profile?.username) {
    return `@${profile.username}`;
  }

  return "@user";
}

function getProfileAvatar(profile) {
  return profile?.avatar_url || fallbackAvatar(getProfileDisplayName(profile));
}

function getProfilePostCount(userId) {
  if (!Array.isArray(threads)) return 0;

  return threads.filter((thread) => thread.user_id === userId).length;
}

function getSearchableProfiles() {
  if (!Array.isArray(profiles)) return [];

  const seen = new Set();

  return profiles
    .filter((profile) => profile && profile.id && !seen.has(profile.id) && seen.add(profile.id))
    .sort((a, b) => {
      const aFollowers = typeof getFollowerCount === "function" ? getFollowerCount(a.id) : 0;
      const bFollowers = typeof getFollowerCount === "function" ? getFollowerCount(b.id) : 0;
      const aPosts = getProfilePostCount(a.id);
      const bPosts = getProfilePostCount(b.id);

      return (bFollowers + bPosts) - (aFollowers + aPosts);
    });
}

function searchProfiles(query) {
  const cleanQuery = normalizeSearchText(query);
  const allProfiles = getSearchableProfiles();

  if (!cleanQuery) {
    return allProfiles.slice(0, 8);
  }

  return allProfiles
    .filter((profile) => {
      const name = normalizeSearchText(profile.full_name);
      const username = normalizeSearchText(profile.username);
      const bio = normalizeSearchText(profile.bio);

      return (
        name.includes(cleanQuery) ||
        username.includes(cleanQuery) ||
        bio.includes(cleanQuery)
      );
    })
    .slice(0, 12);
}

function renderUserSearchResults() {
  const resultsWrap = document.getElementById("userSearchResults");
  const clearBtn = document.getElementById("clearUserSearchBtn");

  if (!resultsWrap) return;

  const matches = searchProfiles(userSearchQuery);
  const hasQuery = Boolean(normalizeSearchText(userSearchQuery));

  if (clearBtn) {
    clearBtn.classList.toggle("hidden", !hasQuery);
  }

  if (!matches.length) {
    resultsWrap.innerHTML = `
      <div class="user-search-empty">
        <strong>${typeof t === "function" ? t("noUsersFound") : "No users found."}</strong>
        <span>${typeof t === "function" ? t("tryAnotherUser") : "Try another name or username."}</span>
      </div>
    `;
    return;
  }

  resultsWrap.innerHTML = matches
    .map((profile) => {
      const userId = profile.id;
      const name = getProfileDisplayName(profile);
      const username = getProfileUsernameLabel(profile);
      const avatar = getProfileAvatar(profile);
      const bio = profile.bio || (typeof t === "function" ? t("noBioYet") : "No bio yet.");
      const postCount = getProfilePostCount(userId);
      const followerCount = typeof getFollowerCount === "function" ? getFollowerCount(userId) : 0;
      const isOwnProfile = currentUser && currentUser.id === userId;
      const alreadyFollowing = typeof isFollowingUser === "function" ? isFollowingUser(userId) : false;

      const followButton = isOwnProfile
        ? `<span class="user-search-you">${typeof t === "function" ? t("you") : "You"}</span>`
        : currentUser
          ? `
            <button
              class="user-search-follow ${alreadyFollowing ? "following" : ""}"
              type="button"
              data-follow-user-id="${escapeHTML(userId)}"
            >
              ${alreadyFollowing ? (typeof t === "function" ? t("following") : "Following") : (typeof t === "function" ? t("follow") : "Follow")}
            </button>
          `
          : `
            <button
              class="user-search-follow"
              type="button"
              data-search-login
            >
              ${typeof t === "function" ? t("signIn") : "Sign in"}
            </button>
          `;

      return `
        <article class="user-search-result">
          <button class="user-search-main" type="button" data-search-profile-id="${escapeHTML(userId)}">
            <img src="${escapeHTML(avatar)}" alt="${escapeHTML(name)} avatar" loading="lazy" />

            <div>
              <strong>${escapeHTML(name)}</strong>
              <span>${escapeHTML(username)}</span>
              <p>${escapeHTML(bio)}</p>

              <small>
                ${postCount} ${postCount === 1 ? (typeof t === "function" ? t("post") : "post") : (typeof t === "function" ? t("posts") : "posts")} · ${followerCount} ${followerCount === 1 ? (typeof t === "function" ? t("follower") : "follower") : (typeof t === "function" ? t("followers") : "followers")}
              </small>
            </div>
          </button>

          <div class="user-search-actions">
            ${followButton}
          </div>
        </article>
      `;
    })
    .join("");

  bindUserSearchResultActions();
}

function bindUserSearchResultActions() {
  document.querySelectorAll("[data-search-profile-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const userId = button.dataset.searchProfileId;

      if (typeof openPublicProfile === "function") {
        openPublicProfile(userId);
        return;
      }

      window.location.href = `/?profile=${encodeURIComponent(userId)}`;
    });
  });

  document.querySelectorAll("[data-search-login]").forEach((button) => {
    button.addEventListener("click", () => {
      if (typeof signInWithGoogle === "function") {
        signInWithGoogle();
      }
    });
  });

  if (typeof bindFollowButtons === "function") {
    bindFollowButtons();
  }
}

function scrollToUserSearch() {
  const card = document.getElementById("userSearchCard");
  const input = document.getElementById("userSearchInput");

  if (card) {
    card.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (input) {
    setTimeout(() => input.focus(), 250);
  }
}

function closeUserSearchFocus() {
  const input = document.getElementById("userSearchInput");

  if (input) {
    input.blur();
  }
}

function markUserSearchProfileOpen(userId) {
  document.querySelectorAll(".user-search-result").forEach((card) => {
    const button = card.querySelector("[data-search-profile-id]");
    const isActive = button && button.dataset.searchProfileId === userId;
    card.classList.toggle("active", Boolean(isActive));
  });
}

function setupUserSearchEvents() {
  const input = document.getElementById("userSearchInput");
  const clearBtn = document.getElementById("clearUserSearchBtn");
  const sidebarSearchBtn = document.getElementById("sidebarSearchBtn");

  if (input) {
    input.addEventListener("input", () => {
      userSearchQuery = input.value;
      renderUserSearchResults();
    });

    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        input.value = "";
        userSearchQuery = "";
        renderUserSearchResults();
        input.blur();
      }
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      userSearchQuery = "";

      if (input) {
        input.value = "";
        input.focus();
      }

      renderUserSearchResults();
    });
  }

  if (sidebarSearchBtn) {
    sidebarSearchBtn.addEventListener("click", () => {
      if (typeof closeSidebar === "function") {
        closeSidebar();
      }

      if (window.location.pathname.toLowerCase().startsWith("/search")) {
        scrollToUserSearch();
        return;
      }

      window.location.href = "/search/";
    });
  }
}

function initUserSearch() {
  if (userSearchReady) {
    renderUserSearchResults();
    return;
  }

  userSearchReady = true;
  setupUserSearchEvents();
  renderUserSearchResults();

  window.addEventListener("loomyva:language-change", renderUserSearchResults);

  const params = new URLSearchParams(window.location.search);

  if (params.get("search") === "1") {
    setTimeout(() => {
      scrollToUserSearch();

      if (typeof setBottomNavActive === "function") {
        setBottomNavActive("search");
      }

      window.history.replaceState({}, document.title, window.location.pathname);
    }, 350);
  }
}


async function loadUserSearchData() {
  const [profilesResponse, threadsResponse] = await Promise.all([
    supabaseClient
      .from("profiles")
      .select("*"),
    supabaseClient
      .from("threads")
      .select("id,user_id")
  ]);

  if (profilesResponse.error) {
    setStatus(profilesResponse.error.message, "error");
    return;
  }

  if (threadsResponse.error) {
    setStatus(threadsResponse.error.message, "error");
    return;
  }

  profiles = profilesResponse.data || [];
  threads = threadsResponse.data || [];

  if (typeof loadFollows === "function") {
    await loadFollows();
  }

  userSearchDataLoaded = true;
  renderUserSearchResults();
}

async function initSearchPage() {
  setupAuthButtons();
  mountSharedUI({ includeModal: false });
  setBottomNavActive("search");

  await restoreSession();
  initUserSearch();
  await loadUserSearchData();

  listenForAuthChanges({
    onSignedIn: async () => {
      await loadUserSearchData();

      if (typeof initNotificationsSystem === "function") {
        await initNotificationsSystem();
      }
    },
    onSignedOut: async () => {
      currentProfile = null;
      await loadUserSearchData();

      if (typeof resetNotificationsSystem === "function") {
        resetNotificationsSystem();
      }
    }
  });
}
