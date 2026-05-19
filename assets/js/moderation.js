let moderationBlocks = [];
let moderationReady = false;
let moderationBusy = false;

function getCurrentBlockedUserIds() {
  if (!currentUser || !Array.isArray(moderationBlocks)) return [];
  return moderationBlocks
    .filter((row) => row.blocker_id === currentUser.id)
    .map((row) => row.blocked_id);
}

function getUsersBlockingCurrentUserIds() {
  if (!currentUser || !Array.isArray(moderationBlocks)) return [];
  return moderationBlocks
    .filter((row) => row.blocked_id === currentUser.id)
    .map((row) => row.blocker_id);
}

function isUserBlocked(userId) {
  if (!currentUser || !userId) return false;
  return getCurrentBlockedUserIds().includes(userId);
}

function isBlockedByUser(userId) {
  if (!currentUser || !userId) return false;
  return getUsersBlockingCurrentUserIds().includes(userId);
}

function isModerationHiddenUser(userId) {
  if (!currentUser || !userId) return false;
  return isUserBlocked(userId) || isBlockedByUser(userId);
}

function canInteractWithUser(userId) {
  if (!currentUser || !userId) return false;
  if (userId === currentUser.id) return true;
  return !isModerationHiddenUser(userId);
}

function filterBlockedProfiles(profileList) {
  if (!Array.isArray(profileList)) return [];
  return profileList.filter((profile) => {
    if (!profile?.id) return false;
    if (currentUser && profile.id === currentUser.id) return true;
    return !isModerationHiddenUser(profile.id);
  });
}

function filterBlockedThreads(threadList) {
  if (!Array.isArray(threadList)) return [];
  return threadList.filter((thread) => {
    if (!thread?.user_id) return true;
    if (currentUser && thread.user_id === currentUser.id) return true;
    return !isModerationHiddenUser(thread.user_id);
  });
}

function filterBlockedComments(commentList) {
  if (!Array.isArray(commentList)) return [];
  return commentList.filter((comment) => {
    if (!comment?.user_id) return true;
    if (currentUser && comment.user_id === currentUser.id) return true;
    return !isModerationHiddenUser(comment.user_id);
  });
}

async function loadModerationData() {
  if (!currentUser) {
    moderationBlocks = [];
    moderationReady = true;
    return;
  }

  const { data, error } = await supabaseClient
    .from("user_blocks")
    .select("blocker_id, blocked_id, created_at")
    .or(`blocker_id.eq.${currentUser.id},blocked_id.eq.${currentUser.id}`);

  if (error) {
    console.warn("Moderation load warning:", error.message);
    moderationBlocks = [];
    moderationReady = true;
    return;
  }

  moderationBlocks = data || [];
  moderationReady = true;
}

function requireModerationLogin() {
  if (currentUser) return true;
  setStatus(typeof t === "function" ? t("signInSafetyTools") : "Sign in first to use safety tools.", "error");
  if (typeof openSidebar === "function") openSidebar();
  return false;
}

function getModerationReason(defaultReason = "App Store safety report") {
  const reason = window.prompt(typeof t === "function" ? t("reportReasonPrompt") : "Optional: tell us why you are reporting this.", defaultReason);
  if (reason === null) return null;
  return String(reason || defaultReason).trim().slice(0, 500);
}

async function reportPost(threadId, reportedUserId, reasonOverride) {
  if (!requireModerationLogin()) return;
  if (!threadId || !reportedUserId) return;

  const reason = typeof reasonOverride === "string"
    ? String(reasonOverride || (typeof t === "function" ? t("reportedPost") : "Reported post")).trim().slice(0, 500)
    : getModerationReason(typeof t === "function" ? t("reportedPost") : "Reported post");
  if (reason === null) return;

  const { error } = await supabaseClient.from("content_reports").insert({
    reporter_id: currentUser.id,
    reported_user_id: reportedUserId,
    thread_id: threadId,
    report_type: "post",
    reason
  });

  if (error) {
    setStatus(error.message, "error");
    return false;
  }

  setStatus(typeof t === "function" ? t("reportSentSafe") : "Report sent. Thanks for keeping Loomyva safe.", "success");
}

async function reportUser(userId, reasonOverride) {
  if (!requireModerationLogin()) return;
  if (!userId || userId === currentUser.id) return;

  const reason = typeof reasonOverride === "string"
    ? String(reasonOverride || (typeof t === "function" ? t("reportedUser") : "Reported user")).trim().slice(0, 500)
    : getModerationReason(typeof t === "function" ? t("reportedUser") : "Reported user");
  if (reason === null) return;

  const { error } = await supabaseClient.from("content_reports").insert({
    reporter_id: currentUser.id,
    reported_user_id: userId,
    report_type: "user",
    reason
  });

  if (error) {
    setStatus(error.message, "error");
    return;
  }

  setStatus(typeof t === "function" ? t("userReportSent") : "User report sent.", "success");
}

async function blockUser(userId, options = {}) {
  if (!requireModerationLogin()) return;
  if (!userId || userId === currentUser.id) return;

  const skipConfirm = Boolean(options && options.skipConfirm);
  if (!skipConfirm) {
    const confirmed = window.confirm(typeof t === "function" ? t("blockConfirm") : "Block this user? You will no longer see their posts or profile in search.");
    if (!confirmed) return;
  }

  moderationBusy = true;

  const { error } = await supabaseClient.from("user_blocks").upsert({
    blocker_id: currentUser.id,
    blocked_id: userId
  }, { onConflict: "blocker_id,blocked_id" });

  moderationBusy = false;

  if (error) {
    setStatus(error.message, "error");
    return;
  }

  setStatus(typeof t === "function" ? t("userBlocked") : "User blocked.", "success");
  await loadModerationData();

  if (typeof loadFollows === "function") await loadFollows();
  if (typeof closePublicProfile === "function") closePublicProfile();
  if (typeof renderThreads === "function") renderThreads();
  if (typeof renderUserSearchResults === "function") renderUserSearchResults();
}

async function unblockUser(userId) {
  if (!requireModerationLogin()) return false;
  if (!userId || userId === currentUser.id) return false;

  const { error } = await supabaseClient
    .from("user_blocks")
    .delete()
    .eq("blocker_id", currentUser.id)
    .eq("blocked_id", userId);

  if (error) {
    setStatus(error.message, "error");
    return false;
  }

  setStatus(typeof t === "function" ? t("userUnblocked") : "User unblocked.", "success");
  await loadModerationData();

  if (typeof loadFollows === "function") await loadFollows();
  if (typeof renderThreads === "function") renderThreads();
  if (typeof renderUserSearchResults === "function") renderUserSearchResults();
  if (typeof loadBlockedUsersList === "function") {
    const blockedUsersModalBackdrop = document.getElementById("blockedUsersModalBackdrop");
    if (blockedUsersModalBackdrop?.classList.contains("active")) {
      await loadBlockedUsersList();
    }
  }

  return true;
}

function ensureModerationMenuModal() {
  let modal = document.getElementById("moderationMenuBackdrop");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "moderationMenuBackdrop";
  modal.className = "moderation-menu-backdrop";
  modal.innerHTML = `
    <section class="moderation-menu-modal" role="dialog" aria-modal="true" aria-labelledby="moderationMenuTitle">
      <div class="moderation-menu-header">
        <div>
          <span class="eyebrow">${typeof t === "function" ? t("safetyTools") : "Safety tools"}</span>
          <h2 id="moderationMenuTitle">${typeof t === "function" ? t("moreActions") : "More actions"}</h2>
        </div>
        <button class="moderation-menu-close" type="button" data-close-moderation-menu aria-label="${typeof t === "function" ? t("close") : "Close"}">×</button>
      </div>

      <p class="moderation-menu-copy">${typeof t === "function" ? t("moderationMenuText") : "Choose what you want to do with this post or user."}</p>

      <div class="moderation-menu-warning">
        ${typeof t === "function" ? t("blockWarning") : "Blocking hides this user from your feed and search. Reports are sent to your moderation table."}
      </div>

      <label class="moderation-reason-label" for="moderationReasonInput">
        ${typeof t === "function" ? t("reportReasonLabel") : "Report reason"}
      </label>
      <textarea id="moderationReasonInput" class="moderation-reason-input" maxlength="500" rows="4" placeholder="${typeof t === "function" ? t("reportReasonPlaceholder") : "Optional, but helpful for moderation."}"></textarea>

      <div class="moderation-menu-actions">
        <button class="moderation-menu-action" type="button" data-menu-report-post>
          ${typeof t === "function" ? t("reportPost") : "Report Post"}
        </button>
        <button class="moderation-menu-action" type="button" data-menu-report-user>
          ${typeof t === "function" ? t("reportUser") : "Report User"}
        </button>
        <button class="moderation-menu-action danger" type="button" data-menu-block-user>
          ${typeof t === "function" ? t("blockUser") : "Block User"}
        </button>
      </div>
    </section>
  `;
  document.body.appendChild(modal);

  modal.addEventListener("click", (event) => {
    if (event.target === modal || event.target.closest("[data-close-moderation-menu]")) {
      closeModerationMenu();
    }
  });

  modal.querySelector("[data-menu-report-post]")?.addEventListener("click", async () => {
    const postId = modal.dataset.postId || "";
    const userId = modal.dataset.userId || "";
    const reason = modal.querySelector("#moderationReasonInput")?.value || (typeof t === "function" ? t("reportedPost") : "Reported post");
    await reportPost(postId, userId, reason);
    closeModerationMenu();
  });

  modal.querySelector("[data-menu-report-user]")?.addEventListener("click", async () => {
    const userId = modal.dataset.userId || "";
    const reason = modal.querySelector("#moderationReasonInput")?.value || (typeof t === "function" ? t("reportedUser") : "Reported user");
    await reportUser(userId, reason);
    closeModerationMenu();
  });

  modal.querySelector("[data-menu-block-user]")?.addEventListener("click", async () => {
    const userId = modal.dataset.userId || "";
    await blockUser(userId, { skipConfirm: true });
    closeModerationMenu();
  });

  return modal;
}

function openModerationMenu({ postId = "", userId = "", context = "post" } = {}) {
  if (!requireModerationLogin()) return;
  if (!userId || (currentUser && userId === currentUser.id)) return;

  const modal = ensureModerationMenuModal();
  modal.dataset.postId = postId;
  modal.dataset.userId = userId;
  modal.dataset.context = context;

  const reportPostBtn = modal.querySelector("[data-menu-report-post]");
  if (reportPostBtn) {
    reportPostBtn.classList.toggle("hidden", !postId);
  }

  const input = modal.querySelector("#moderationReasonInput");
  if (input) input.value = "";

  modal.classList.add("active");
  document.body.classList.add("modal-open");

  const firstAction = modal.querySelector("[data-menu-report-post]:not(.hidden), [data-menu-report-user], [data-menu-block-user]");
  setTimeout(() => firstAction?.focus(), 80);
}

function closeModerationMenu() {
  const modal = document.getElementById("moderationMenuBackdrop");
  if (!modal) return;
  modal.classList.remove("active");
  document.body.classList.remove("modal-open");
}

function bindModerationButtons() {
  document.querySelectorAll("[data-open-moderation-menu]").forEach((button) => {
    button.addEventListener("click", () => {
      openModerationMenu({
        postId: button.dataset.moderationPostId || "",
        userId: button.dataset.moderationUserId || "",
        context: button.dataset.moderationContext || "post"
      });
    });
  });

  document.querySelectorAll("[data-report-post-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      await reportPost(button.dataset.reportPostId, button.dataset.reportUserId);
    });
  });

  document.querySelectorAll("[data-report-user-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      await reportUser(button.dataset.reportUserId);
    });
  });

  document.querySelectorAll("[data-block-user-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      await blockUser(button.dataset.blockUserId);
    });
  });

  document.querySelectorAll("[data-unblock-user-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      await unblockUser(button.dataset.unblockUserId);
    });
  });
}


let moderationEscapeListenerReady = false;
function initModerationKeyboardClose() {
  if (moderationEscapeListenerReady) return;
  moderationEscapeListenerReady = true;
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeModerationMenu();
  });
}

initModerationKeyboardClose();
