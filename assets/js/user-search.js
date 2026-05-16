let userSearchQuery = "";
let userSearchReady = false;
let userSearchDataLoaded = false;

/*
  Search follow fallback state.

  Your project already loads /assets/js/follows.js before this file.
  This file will use your existing follow system if available.

  If follows.js does not expose the needed functions, this fallback makes
  the Search page Follow / Following buttons still work directly.
*/
let searchFollowerRows = [];
let searchFollowActionBusy = false;

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
  if (profile?.avatar_url) {
    return profile.avatar_url;
  }

  if (typeof fallbackAvatar === "function") {
    return fallbackAvatar(getProfileDisplayName(profile));
  }

  return "/assets/img/index.png";
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
      const aFollowers = getSearchFollowerCount(a.id);
      const bFollowers = getSearchFollowerCount(b.id);
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

/* =========================================================
   FOLLOW HELPERS FOR SEARCH PAGE
========================================================= */

function getSearchFollowerCount(userId) {
  if (typeof getFollowerCount === "function") {
    return getFollowerCount(userId);
  }

  if (!Array.isArray(searchFollowerRows)) return 0;

  return searchFollowerRows.filter((row) => row.following_id === userId).length;
}

function getSearchFollowingCount(userId) {
  if (typeof getFollowingCount === "function") {
    return getFollowingCount(userId);
  }

  if (!Array.isArray(searchFollowerRows)) return 0;

  return searchFollowerRows.filter((row) => row.follower_id === userId).length;
}

function isSearchFollowingUser(userId) {
  if (typeof isFollowingUser === "function") {
    return isFollowingUser(userId);
  }

  if (!currentUser || !Array.isArray(searchFollowerRows)) {
    return false;
  }

  return searchFollowerRows.some((row) => {
    return row.follower_id === currentUser.id && row.following_id === userId;
  });
}

async function loadSearchFollowsFallback() {
  if (typeof loadFollows === "function") {
    await loadFollows();
    return;
  }

  if (!window.supabaseClient) {
    console.warn("supabaseClient missing. Cannot load follows.");
    searchFollowerRows = [];
    return;
  }

  const { data, error } = await supabaseClient
    .from("thread_follows")
    .select("follower_id, following_id, created_at");

  if (error) {
    console.error("Load search follows fallback error:", error);
    searchFollowerRows = [];
    return;
  }

  searchFollowerRows = data || [];
}

async function followUserFromSearch(targetUserId, button) {
  if (!targetUserId || searchFollowActionBusy) return;

  if (!currentUser) {
    if (typeof openSidebar === "function") {
      openSidebar();
      return;
    }

    if (typeof signInWithGoogle === "function") {
      await signInWithGoogle();
    }

    return;
  }

  if (currentUser.id === targetUserId) return;

  searchFollowActionBusy = true;
  setSearchFollowButtonLoading(button, true);

  try {
    /*
      If your existing follows.js exposes toggleFollowUser(userId),
      we use it. Otherwise we directly insert into public.followers.
    */
    if (typeof toggleFollowUser === "function") {
      await toggleFollowUser(targetUserId);
    } else if (typeof followUser === "function") {
      await followUser(targetUserId);
    } else {
      const { error } = await supabaseClient
        .from("followers")
        .insert({
          follower_id: currentUser.id,
          following_id: targetUserId
        });

      if (error && error.code !== "23505") {
        throw error;
      }
    }

    await loadSearchFollowsFallback();
    renderUserSearchResults();
  } catch (error) {
    console.error("Follow from search error:", error);
    showSearchFollowButtonError(button);
  } finally {
    searchFollowActionBusy = false;
    setSearchFollowButtonLoading(button, false);
  }
}

async function unfollowUserFromSearch(targetUserId, button) {
  if (!targetUserId || searchFollowActionBusy) return;

  if (!currentUser) {
    if (typeof openSidebar === "function") {
      openSidebar();
    }

    return;
  }

  searchFollowActionBusy = true;
  setSearchFollowButtonLoading(button, true);

  try {
    /*
      If your existing follows.js exposes toggleFollowUser(userId),
      we use it. Otherwise we directly delete from public.followers.
    */
    if (typeof toggleFollowUser === "function") {
      await toggleFollowUser(targetUserId);
    } else if (typeof unfollowUser === "function") {
      await unfollowUser(targetUserId);
    } else {
      const { error } = await supabaseClient
        .from("followers")
        .delete()
        .eq("follower_id", currentUser.id)
        .eq("following_id", targetUserId);

      if (error) {
        throw error;
      }
    }

    await loadSearchFollowsFallback();
    renderUserSearchResults();
  } catch (error) {
    console.error("Unfollow from search error:", error);
    showSearchFollowButtonError(button);
  } finally {
    searchFollowActionBusy = false;
    setSearchFollowButtonLoading(button, false);
  }
}

function setSearchFollowButtonLoading(button, isLoading) {
  if (!button) return;

  button.disabled = isLoading;
  button.classList.toggle("loading", isLoading);

  if (isLoading) {
    button.dataset.originalText = button.textContent.trim();
    button.textContent = "...";
    return;
  }

  if (button.dataset.originalText) {
    button.textContent = button.dataset.originalText;
    delete button.dataset.originalText;
  }
}

function showSearchFollowButtonError(button) {
  if (!button) return;

  const oldText = button.dataset.originalText || button.textContent.trim();

  button.textContent = "Error";

  setTimeout(() => {
    button.textContent = oldText;
  }, 1200);
}

/* =========================================================
   RENDER SEARCH RESULTS
========================================================= */

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
      const followerCount = getSearchFollowerCount(userId);
      const followingCount = getSearchFollowingCount(userId);
      const isOwnProfile = currentUser && currentUser.id === userId;
      const alreadyFollowing = isSearchFollowingUser(userId);

      const followButton = isOwnProfile
        ? `<span class="user-search-you">${typeof t === "function" ? t("you") : "You"}</span>`
        : currentUser
          ? `
            <button
              class="user-search-follow ${alreadyFollowing ? "following" : ""}"
              type="button"
              data-follow-user-id="${escapeHTML(userId)}"
              data-search-follow-state="${alreadyFollowing ? "following" : "not-following"}"
              aria-label="${alreadyFollowing ? "Unfollow" : "Follow"} ${escapeHTML(name)}"
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
                ${postCount} ${postCount === 1 ? (typeof t === "function" ? t("post") : "post") : (typeof t === "function" ? t("posts") : "posts")} · ${followerCount} ${followerCount === 1 ? (typeof t === "function" ? t("follower") : "follower") : (typeof t === "function" ? t("followers") : "followers")} · ${followingCount} ${followingCount === 1 ? (typeof t === "function" ? t("followingSingular") : "following") : (typeof t === "function" ? t("following") : "following")}
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
      if (typeof openSidebar === "function") {
        openSidebar();
        return;
      }

      if (typeof signInWithGoogle === "function") {
        signInWithGoogle();
      }
    });
  });

  /*
    If your existing follows.js has bindFollowButtons(), use it.
    If not, bind the Search page buttons here.
  */
  if (typeof bindFollowButtons === "function") {
    bindFollowButtons();

    document.querySelectorAll("[data-follow-user-id]").forEach((button) => {
      button.addEventListener("click", async () => {
        setTimeout(async () => {
          await loadSearchFollowsFallback();
          renderUserSearchResults();
        }, 250);
      });
    });

    return;
  }

  document.querySelectorAll("[data-follow-user-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      const userId = button.dataset.followUserId;
      const isFollowing = button.dataset.searchFollowState === "following";

      if (isFollowing) {
        await unfollowUserFromSearch(userId, button);
      } else {
        await followUserFromSearch(userId, button);
      }
    });
  });
}

/* =========================================================
   SEARCH UX
========================================================= */

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

/* =========================================================
   DATA LOADING
========================================================= */

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

  await loadSearchFollowsFallback();

  userSearchDataLoaded = true;
  renderUserSearchResults();
}

/* =========================================================
   PAGE INIT
========================================================= */

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
