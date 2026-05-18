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

async function reportPost(threadId, reportedUserId) {
  if (!requireModerationLogin()) return;
  if (!threadId || !reportedUserId) return;

  const reason = getModerationReason(typeof t === "function" ? t("reportedPost") : "Reported post");
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

async function reportUser(userId) {
  if (!requireModerationLogin()) return;
  if (!userId || userId === currentUser.id) return;

  const reason = getModerationReason(typeof t === "function" ? t("reportedUser") : "Reported user");
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

async function blockUser(userId) {
  if (!requireModerationLogin()) return;
  if (!userId || userId === currentUser.id) return;

  const confirmed = window.confirm(typeof t === "function" ? t("blockConfirm") : "Block this user? You will no longer see their posts or profile in search.");
  if (!confirmed) return;

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

function bindModerationButtons() {
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
