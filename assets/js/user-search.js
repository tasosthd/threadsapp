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

  const safeProfiles = typeof filterBlockedProfiles === "function"
    ? filterBlockedProfiles(profiles)
    : profiles;

  return safeProfiles
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

  if (typeof canInteractWithUser === "function" && !canInteractWithUser(targetUserId)) {
    setStatus("You cannot follow or interact with a blocked user.", "error");
    return;
  }

  searchFollowActionBusy = true;
  setSearchFollowButtonLoading(button, true);

  try {
    /*
      If your existing follows.js exposes toggleFollowUser(userId),
      we use it. Otherwise we directly insert into public.thread_follows.
    */
    if (typeof toggleFollowUser === "function") {
      await toggleFollowUser(targetUserId);
    } else if (typeof followUser === "function") {
      await followUser(targetUserId);
    } else {
      const { error } = await supabaseClient
        .from("thread_follows")
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
      we use it. Otherwise we directly delete from public.thread_follows.
    */
    if (typeof toggleFollowUser === "function") {
      await toggleFollowUser(targetUserId);
    } else if (typeof unfollowUser === "function") {
      await unfollowUser(targetUserId);
    } else {
      const { error } = await supabaseClient
        .from("thread_follows")
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

      const postLabel =
        postCount === 1
          ? (typeof t === "function" ? t("post") : "post")
          : (typeof t === "function" ? t("posts") : "posts");

      const followerLabel =
        followerCount === 1
          ? (typeof t === "function" ? t("follower") : "follower")
          : (typeof t === "function" ? t("followers") : "followers");

      const followingLabel = typeof t === "function" ? t("following") : "following";

      const messageButton = (!isOwnProfile && currentUser)
        ? `
          <button
            class="chat-message-link"
            type="button"
            data-open-chat-user-id="${escapeHTML(userId)}"
            aria-label="${typeof t === "function" ? t("message") : "Message"} ${escapeHTML(name)}"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2ZM4 14V4h16v10H4Z"/>
            </svg>
          </button>
        `
        : "";

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
                ${postCount} ${postLabel} · ${followerCount} ${followerLabel} · ${followingCount} ${followingLabel}
              </small>
            </div>
          </button>

          <div class="user-search-actions">
            ${messageButton}
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

  document.querySelectorAll("[data-open-chat-user-id]").forEach((button) => {
    button.addEventListener("click", () => {
      window.location.href = `/chat/?user=${encodeURIComponent(button.dataset.openChatUserId)}`;
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
  if (typeof loadModerationData === "function") {
    await loadModerationData();
  }
  initUserSearch();
  await loadUserSearchData();

  listenForAuthChanges({
    onSignedIn: async () => {
      if (typeof loadModerationData === "function") {
        await loadModerationData();
      }
      await loadUserSearchData();

      if (typeof initNotificationsSystem === "function") {
        await initNotificationsSystem();
      }
    },
    onSignedOut: async () => {
      currentProfile = null;
      if (typeof loadModerationData === "function") {
        await loadModerationData();
      }
      await loadUserSearchData();

      if (typeof resetNotificationsSystem === "function") {
        resetNotificationsSystem();
      }
    }
  });
}

/* =========================================================
   INLINE SEARCH CHAT MODAL
========================================================= */

let searchChatTargetUserId = null;
let searchChatConversationId = null;
let searchChatRealtimeChannel = null;

function getSearchChatOverlay() {
  return document.getElementById("searchChatOverlay");
}

function ensureSearchChatModal() {
  if (document.getElementById("searchChatOverlay")) return;

  const overlay = document.createElement("div");
  overlay.id = "searchChatOverlay";
  overlay.className = "search-chat-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Chat");

  overlay.innerHTML = `
    <div class="search-chat-modal" id="searchChatModal">
      <div class="search-chat-modal-header" id="searchChatHeader">
        <img id="searchChatAvatar" src="" alt="" />
        <div class="search-chat-modal-header-info">
          <strong id="searchChatName">...</strong>
          <span id="searchChatUsername">@...</span>
        </div>
        <button class="search-chat-close-btn" id="searchChatCloseBtn" type="button" aria-label="Close chat">×</button>
      </div>
      <div class="search-chat-messages" id="searchChatMessages">
        <div class="chat-loading">Loading…</div>
      </div>
      <div class="search-chat-status hidden" id="searchChatStatus"></div>
      <div class="search-chat-form">
        <textarea
          class="search-chat-input"
          id="searchChatInput"
          placeholder="Write a message…"
          rows="1"
          maxlength="1000"
        ></textarea>
        <button class="search-chat-send-btn" id="searchChatSendBtn" type="button" aria-label="Send">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z"/>
          </svg>
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeSearchChatModal();
  });

  document.getElementById("searchChatCloseBtn").addEventListener("click", closeSearchChatModal);

  document.getElementById("searchChatSendBtn").addEventListener("click", sendSearchChatMessage);

  document.getElementById("searchChatInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendSearchChatMessage();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeSearchChatModal();
  });
}

async function openSearchChatModal(userId) {
  if (!userId) return;

  if (!currentUser) {
    if (typeof openSidebar === "function") openSidebar();
    return;
  }

  searchChatTargetUserId = userId;

  ensureSearchChatModal();

  // Populate header with target user info
  const profile = (typeof profiles !== "undefined" ? profiles : []).find((p) => p.id === userId);
  const name = profile?.full_name || profile?.username || "User";
  const username = profile?.username ? `@${profile.username}` : "";
  const avatar = profile?.avatar_url || (typeof fallbackAvatar === "function" ? fallbackAvatar(name) : "/assets/img/index.png");

  document.getElementById("searchChatAvatar").src = avatar;
  document.getElementById("searchChatAvatar").alt = `${name} avatar`;
  document.getElementById("searchChatName").textContent = name;
  document.getElementById("searchChatUsername").textContent = username;

  // Show modal
  const overlay = getSearchChatOverlay();
  overlay.classList.add("open");
  document.body.style.overflow = "hidden";

  // Focus input
  setTimeout(() => document.getElementById("searchChatInput")?.focus(), 280);

  // Load or create conversation
  await initSearchChatConversation(userId);
}

function closeSearchChatModal() {
  const overlay = getSearchChatOverlay();
  if (!overlay) return;
  overlay.classList.remove("open");
  document.body.style.overflow = "";

  if (searchChatRealtimeChannel) {
    supabaseClient.removeChannel(searchChatRealtimeChannel);
    searchChatRealtimeChannel = null;
  }

  searchChatConversationId = null;
  searchChatTargetUserId = null;
}

async function initSearchChatConversation(otherUserId) {
  const messagesEl = document.getElementById("searchChatMessages");
  if (messagesEl) messagesEl.innerHTML = `<div class="chat-loading">Loading…</div>`;

  try {
    // Check for existing conversation
    const { data: participantRows } = await supabaseClient
      .from("chat_participants")
      .select("conversation_id")
      .eq("user_id", currentUser.id);

    const myConvIds = (participantRows || []).map((r) => r.conversation_id);

    let conversationId = null;

    if (myConvIds.length) {
      const { data: otherRows } = await supabaseClient
        .from("chat_participants")
        .select("conversation_id")
        .eq("user_id", otherUserId)
        .in("conversation_id", myConvIds);

      conversationId = otherRows?.[0]?.conversation_id || null;
    }

    if (!conversationId) {
      // Create new conversation
      const { data: conv, error: convErr } = await supabaseClient
        .from("chat_conversations")
        .insert({ created_by: currentUser.id })
        .select("id")
        .single();

      if (convErr) throw convErr;
      conversationId = conv.id;

      const { error: partErr } = await supabaseClient
        .from("chat_participants")
        .insert([
          { conversation_id: conversationId, user_id: currentUser.id },
          { conversation_id: conversationId, user_id: otherUserId }
        ]);

      if (partErr) throw partErr;
    }

    searchChatConversationId = conversationId;
    await loadSearchChatMessages();
    subscribeSearchChatRealtime(conversationId);

  } catch (err) {
    console.error("Search chat init error:", err);
    if (messagesEl) messagesEl.innerHTML = `<div class="chat-empty-state">Could not load chat. Please try again.</div>`;
  }
}

async function loadSearchChatMessages() {
  const messagesEl = document.getElementById("searchChatMessages");
  if (!messagesEl || !searchChatConversationId) return;

  const { data, error } = await supabaseClient
    .from("chat_messages")
    .select("id, conversation_id, sender_id, body, created_at")
    .eq("conversation_id", searchChatConversationId)
    .order("created_at", { ascending: true });

  if (error) {
    messagesEl.innerHTML = `<div class="chat-empty-state">Could not load messages.</div>`;
    return;
  }

  const messages = data || [];

  if (!messages.length) {
    messagesEl.innerHTML = `<div class="chat-empty-state">No messages yet. Send the first one 🚀</div>`;
    return;
  }

  const escFn = typeof escapeHTML === "function" ? escapeHTML : (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));

  messagesEl.innerHTML = messages.map((msg) => {
    const own = msg.sender_id === currentUser?.id ? "own" : "";
    const time = new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return `
      <div class="chat-message ${own}">
        <p>${escFn(msg.body)}</p>
        <small>${time}</small>
      </div>
    `;
  }).join("");

  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function subscribeSearchChatRealtime(conversationId) {
  if (searchChatRealtimeChannel) {
    supabaseClient.removeChannel(searchChatRealtimeChannel);
  }

  searchChatRealtimeChannel = supabaseClient
    .channel(`search_chat_${conversationId}`)
    .on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "chat_messages",
      filter: `conversation_id=eq.${conversationId}`
    }, () => loadSearchChatMessages())
    .subscribe();
}

async function sendSearchChatMessage() {
  const input = document.getElementById("searchChatInput");
  const body = String(input?.value || "").trim();

  if (!body || !currentUser || !searchChatConversationId) return;

  input.value = "";
  input.style.height = "auto";

  const { error } = await supabaseClient
    .from("chat_messages")
    .insert({ conversation_id: searchChatConversationId, sender_id: currentUser.id, body });

  if (error) {
    console.error("Send message error:", error);
    input.value = body;
    showSearchChatStatus("Message failed. Try again.", true);
    return;
  }

  await supabaseClient
    .from("chat_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", searchChatConversationId);

  await loadSearchChatMessages();
}

function showSearchChatStatus(message, isError = false) {
  const el = document.getElementById("searchChatStatus");
  if (!el) return;
  el.textContent = message;
  el.className = "search-chat-status" + (isError ? " error" : "");
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 2600);
}
