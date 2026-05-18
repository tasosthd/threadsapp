let notifications = [];
let notificationsRealtimeChannel = null;

/* =========================
   NOTIFICATION HELPERS
========================= */

function getNotificationActorProfile(actorId) {
  if (!actorId) return null;

  if (typeof profiles !== "undefined" && Array.isArray(profiles)) {
    const feedProfile = profiles.find((profile) => profile.id === actorId);
    if (feedProfile) return feedProfile;
  }

  if (typeof profileData !== "undefined" && profileData?.id === actorId) {
    return profileData;
  }

  if (typeof currentProfile !== "undefined" && currentProfile?.id === actorId) {
    return currentProfile;
  }

  return null;
}

function getNotificationActorName(notification) {
  const actorProfile = getNotificationActorProfile(notification.actor_id);

  return (
    actorProfile?.full_name ||
    actorProfile?.username ||
    notification.actor_name ||
    "Someone"
  );
}

function getNotificationActorAvatar(notification) {
  const actorProfile = getNotificationActorProfile(notification.actor_id);
  const actorName = getNotificationActorName(notification);

  return (
    actorProfile?.avatar_url ||
    notification.actor_avatar ||
    fallbackAvatar(actorName)
  );
}

function getNotificationText(notification) {
  const actorName = getNotificationActorName(notification);

  if (notification.message) {
    return notification.message;
  }

  if (notification.type === "follow") {
    return `${actorName} followed you.`;
  }

  if (notification.type === "like") {
    return `${actorName} liked your post.`;
  }

  if (notification.type === "comment") {
    return `${actorName} commented on your post.`;
  }

  return `${actorName} interacted with you.`;
}

function getNotificationTypeLabel(type) {
  if (type === "follow") return "New follower";
  if (type === "like") return "Post like";
  if (type === "comment") return "New comment";
  return "Notification";
}

function getNotificationIcon(type) {
  if (type === "follow") {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M15 12a5 5 0 1 0-4-8 5 5 0 0 0 4 8Zm-7 2a6 6 0 0 0-6 6 1 1 0 0 0 1 1h10.1a7.9 7.9 0 0 1-.1-1 7 7 0 0 1 2.1-5H8Zm11 1a1 1 0 0 0-1 1v2h-2a1 1 0 1 0 0 2h2v2a1 1 0 1 0 2 0v-2h2a1 1 0 1 0 0-2h-2v-2a1 1 0 0 0-1-1Z"></path>
      </svg>
    `;
  }

  if (type === "like") {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12.1 21.35 10.65 20.03C5.4 15.26 2 12.18 2 8.4 2 5.32 4.42 2.9 7.5 2.9c1.74 0 3.41.81 4.5 2.09C13.09 3.71 14.76 2.9 16.5 2.9 19.58 2.9 22 5.32 22 8.4c0 3.78-3.4 6.86-8.65 11.63l-1.25 1.32Z"></path>
      </svg>
    `;
  }

  if (type === "comment") {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Zm-2 12H6v-2h12v2Zm0-3H6V9h12v2Zm0-3H6V6h12v2Z"></path>
      </svg>
    `;
  }

  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 1 0-14 0v5l-2 2v1h18v-1l-2-2Z"></path>
    </svg>
  `;
}

async function getNotificationActorSnapshot(actorId) {
  if (!actorId) {
    return {
      actor_name: "Someone",
      actor_avatar: null
    };
  }

  const cachedProfile = getNotificationActorProfile(actorId);

  if (cachedProfile) {
    return {
      actor_name: cachedProfile.full_name || cachedProfile.username || "Someone",
      actor_avatar: cachedProfile.avatar_url || null
    };
  }

  const { data, error } = await supabaseClient
    .from("profiles")
    .select("id, full_name, username, avatar_url")
    .eq("id", actorId)
    .maybeSingle();

  if (error || !data) {
    return {
      actor_name: "Someone",
      actor_avatar: null
    };
  }

  return {
    actor_name: data.full_name || data.username || "Someone",
    actor_avatar: data.avatar_url || null
  };
}

/* =========================
   CREATE NOTIFICATIONS
========================= */

async function createNotification({
  userId,
  actorId,
  type,
  threadId = null,
  commentId = null,
  message = null
}) {
  if (!userId || !actorId || !type) return false;
  if (userId === actorId) return false;

  const actorSnapshot = await getNotificationActorSnapshot(actorId);
  const finalMessage =
    message ||
    (
      type === "follow"
        ? `${actorSnapshot.actor_name} followed you.`
        : type === "like"
          ? `${actorSnapshot.actor_name} liked your post.`
          : type === "comment"
            ? `${actorSnapshot.actor_name} commented on your post.`
            : `${actorSnapshot.actor_name} interacted with you.`
    );

  const payload = {
    user_id: userId,
    actor_id: actorId,
    type,
    thread_id: threadId,
    comment_id: commentId,
    message: finalMessage,
    actor_name: actorSnapshot.actor_name,
    actor_avatar: actorSnapshot.actor_avatar
  };

  const { error } = await supabaseClient
    .from("notifications")
    .insert(payload);

  if (error) {
    console.error("Notification create error:", error.message);
    return false;
  }

  return true;
}

async function createFollowNotification(targetUserId) {
  if (!currentUser || !targetUserId || targetUserId === currentUser.id) return false;

  return createNotification({
    userId: targetUserId,
    actorId: currentUser.id,
    type: "follow"
  });
}

async function createLikeNotification(threadId) {
  if (!currentUser || !threadId) return false;

  let targetThread = null;

  if (typeof threads !== "undefined" && Array.isArray(threads)) {
    targetThread = threads.find((thread) => thread.id === threadId);
  }

  if (!targetThread && typeof profileThreads !== "undefined" && Array.isArray(profileThreads)) {
    targetThread = profileThreads.find((thread) => thread.id === threadId);
  }

  if (!targetThread) {
    const { data, error } = await supabaseClient
      .from("threads")
      .select("id, user_id")
      .eq("id", threadId)
      .maybeSingle();

    if (error || !data) return false;
    targetThread = data;
  }

  if (!targetThread.user_id || targetThread.user_id === currentUser.id) return false;

  return createNotification({
    userId: targetThread.user_id,
    actorId: currentUser.id,
    type: "like",
    threadId
  });
}

async function createCommentNotification(threadId, commentId = null) {
  if (!currentUser || !threadId) return false;

  let targetThread = null;

  if (typeof threads !== "undefined" && Array.isArray(threads)) {
    targetThread = threads.find((thread) => thread.id === threadId);
  }

  if (!targetThread && typeof profileThreads !== "undefined" && Array.isArray(profileThreads)) {
    targetThread = profileThreads.find((thread) => thread.id === threadId);
  }

  if (!targetThread) {
    const { data, error } = await supabaseClient
      .from("threads")
      .select("id, user_id")
      .eq("id", threadId)
      .maybeSingle();

    if (error || !data) return false;
    targetThread = data;
  }

  if (!targetThread.user_id || targetThread.user_id === currentUser.id) return false;

  return createNotification({
    userId: targetThread.user_id,
    actorId: currentUser.id,
    type: "comment",
    threadId,
    commentId
  });
}

/* =========================
   LOAD + RENDER NOTIFICATIONS
========================= */

async function loadNotifications() {
  if (!currentUser) {
    notifications = [];
    renderNotifications();
    updateNotificationsBadge();
    return;
  }

  const { data, error } = await supabaseClient
    .from("notifications")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("Load notifications error:", error.message);
    notifications = [];
    renderNotifications();
    updateNotificationsBadge();
    return;
  }

  notifications = data || [];

  renderNotifications();
  updateNotificationsBadge();
}

function updateNotificationsBadge() {
  const badge = document.getElementById("notificationsBadge");
  const sidebarBadge = document.getElementById("sidebarNotificationsBadge");
  const bottomBadge = document.getElementById("bottomNotificationsBadge");

  const unreadCount = notifications.filter((notification) => !notification.is_read).length;

  [badge, sidebarBadge, bottomBadge].forEach((element) => {
    if (!element) return;

    if (unreadCount <= 0) {
      element.classList.add("hidden");
      element.textContent = "0";
      return;
    }

    element.classList.remove("hidden");
    element.textContent = unreadCount > 99 ? "99+" : String(unreadCount);
  });
}

function renderNotifications() {
  const list = document.getElementById("notificationsList");

  if (!list) return;

  if (!currentUser) {
    list.innerHTML = `
      <div class="notifications-empty">
        <strong>Sign in first.</strong>
        <span>Your notifications will appear here.</span>
      </div>
    `;
    return;
  }

  if (!notifications.length) {
    list.innerHTML = `
      <div class="notifications-empty">
        <strong>No notifications yet.</strong>
        <span>When people follow, like, or comment, you’ll see it here.</span>
      </div>
    `;
    return;
  }

  list.innerHTML = notifications
    .map((notification) => {
      const actorName = getNotificationActorName(notification);
      const actorAvatar = getNotificationActorAvatar(notification);
      const text = getNotificationText(notification);
      const label = getNotificationTypeLabel(notification.type);
      const date = formatDate(notification.created_at);

      return `
        <article
          class="notification-card ${notification.is_read ? "" : "unread"}"
          data-notification-id="${escapeHTML(notification.id)}"
          data-notification-type="${escapeHTML(notification.type)}"
          data-notification-actor-id="${escapeHTML(notification.actor_id || "")}"
          data-notification-thread-id="${escapeHTML(notification.thread_id || "")}"
        >
          <button
            class="notification-main"
            type="button"
            data-open-notification-id="${escapeHTML(notification.id)}"
          >
            <div class="notification-avatar-wrap">
              <img src="${escapeHTML(actorAvatar)}" alt="${escapeHTML(actorName)} avatar" loading="lazy" />
              <span class="notification-type-icon">
                ${getNotificationIcon(notification.type)}
              </span>
            </div>

            <div class="notification-info">
              <strong>${escapeHTML(label)}</strong>
              <p>${escapeHTML(text)}</p>
              <span>${escapeHTML(date)}</span>
            </div>
          </button>

          ${
            notification.is_read
              ? ""
              : `
                <button
                  class="notification-dot"
                  type="button"
                  data-mark-notification-read-id="${escapeHTML(notification.id)}"
                  aria-label="Mark notification as read"
                ></button>
              `
          }
        </article>
      `;
    })
    .join("");

  bindNotificationActions();
}

function bindNotificationActions() {
  document.querySelectorAll("[data-open-notification-id]").forEach((button) => {
    if (button.dataset.notificationOpenReady === "true") return;
    button.dataset.notificationOpenReady = "true";

    button.addEventListener("click", async () => {
      const notificationId = button.dataset.openNotificationId;
      await openNotification(notificationId);
    });
  });

  document.querySelectorAll("[data-mark-notification-read-id]").forEach((button) => {
    if (button.dataset.notificationReadReady === "true") return;
    button.dataset.notificationReadReady = "true";

    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      await markNotificationAsRead(button.dataset.markNotificationReadId);
    });
  });
}

async function markNotificationAsRead(notificationId) {
  if (!currentUser || !notificationId) return;

  const { error } = await supabaseClient
    .from("notifications")
    .update({
      is_read: true
    })
    .eq("id", notificationId)
    .eq("user_id", currentUser.id);

  if (error) {
    console.error("Mark notification read error:", error.message);
    return;
  }

  notifications = notifications.map((notification) => {
    if (notification.id !== notificationId) return notification;

    return {
      ...notification,
      is_read: true
    };
  });

  renderNotifications();
  updateNotificationsBadge();
}

async function markAllNotificationsAsRead() {
  if (!currentUser) return;

  const unreadIds = notifications
    .filter((notification) => !notification.is_read)
    .map((notification) => notification.id);

  if (!unreadIds.length) return;

  const { error } = await supabaseClient
    .from("notifications")
    .update({
      is_read: true
    })
    .eq("user_id", currentUser.id)
    .in("id", unreadIds);

  if (error) {
    console.error("Mark all notifications read error:", error.message);
    return;
  }

  notifications = notifications.map((notification) => ({
    ...notification,
    is_read: true
  }));

  renderNotifications();
  updateNotificationsBadge();
}

async function openNotification(notificationId) {
  const notification = notifications.find((item) => item.id === notificationId);
  if (!notification) return;

  await markNotificationAsRead(notificationId);

  if (notification.type === "follow" && notification.actor_id) {
    if (typeof openProfileUserModal === "function") {
      openProfileUserModal(notification.actor_id);
    }

    return;
  }

  if ((notification.type === "like" || notification.type === "comment") && notification.thread_id) {
    if (typeof openCommentsModal === "function" && notification.type === "comment") {
      openCommentsModal(notification.thread_id);
      return;
    }

    if (notification.actor_id && typeof openProfileUserModal === "function") {
      openProfileUserModal(notification.actor_id);
      return;
    }
  }

  if (notification.actor_id && typeof openProfileUserModal === "function") {
    openProfileUserModal(notification.actor_id);
  }
}

/* =========================
   MODAL UI
========================= */

function renderNotificationsModalShell() {
  return `
    <div id="notificationsModalBackdrop" class="notifications-modal-backdrop" aria-hidden="true">
      <section class="notifications-modal" role="dialog" aria-modal="true" aria-labelledby="notificationsModalTitle">
        <div class="notifications-modal-head">
          <div>
            <span class="eyebrow">Activity</span>
            <h2 id="notificationsModalTitle">Notifications</h2>
            <p>Follows, likes, and comments in one clean inbox.</p>
          </div>

          <button id="notificationsModalCloseBtn" class="notifications-modal-close" type="button" aria-label="Close notifications">
            <span></span>
            <span></span>
          </button>
        </div>

        <div class="notifications-modal-actions">
          <button id="markAllNotificationsReadBtn" class="btn ghost-btn" type="button">
            Mark all as read
          </button>
        </div>

        <div id="notificationsList" class="notifications-list">
          <div class="notifications-empty">
            <strong>Loading...</strong>
            <span>Getting your latest activity.</span>
          </div>
        </div>
      </section>
    </div>
  `;
}

function setupNotificationsModal() {
  if (document.body.classList.contains("notifications-page-body")) {
    return;
  }

  if (!document.getElementById("notificationsModalBackdrop")) {
    document.body.insertAdjacentHTML("beforeend", renderNotificationsModalShell());
  }

  const notificationsModalBackdrop = document.getElementById("notificationsModalBackdrop");
  const notificationsModalCloseBtn = document.getElementById("notificationsModalCloseBtn");
  const markAllNotificationsReadBtn = document.getElementById("markAllNotificationsReadBtn");

  if (notificationsModalCloseBtn) {
    notificationsModalCloseBtn.addEventListener("click", closeNotificationsModal);
  }

  if (notificationsModalBackdrop) {
    notificationsModalBackdrop.addEventListener("click", (event) => {
      if (event.target === notificationsModalBackdrop) {
        closeNotificationsModal();
      }
    });
  }

  if (markAllNotificationsReadBtn) {
    markAllNotificationsReadBtn.addEventListener("click", markAllNotificationsAsRead);
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeNotificationsModal();
    }
  });
}

function openNotificationsModal() {
  const notificationsModalBackdrop = document.getElementById("notificationsModalBackdrop");

  if (!notificationsModalBackdrop) return;

  notificationsModalBackdrop.classList.add("active");
  notificationsModalBackdrop.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";

  loadNotifications();
}

function closeNotificationsModal() {
  const notificationsModalBackdrop = document.getElementById("notificationsModalBackdrop");

  if (!notificationsModalBackdrop) return;

  notificationsModalBackdrop.classList.remove("active");
  notificationsModalBackdrop.setAttribute("aria-hidden", "true");

  document.body.style.overflow = "";
}

function setupNotificationButtons() {
  const buttons = document.querySelectorAll("[data-open-notifications]");
  const isNotificationsPage = document.body.classList.contains("notifications-page-body");

  buttons.forEach((button) => {
    if (button.dataset.notificationsReady === "true") return;

    button.dataset.notificationsReady = "true";

    button.addEventListener("click", () => {
      if (isNotificationsPage) {
        const notificationsPanel = document.querySelector(".notifications-page-card");

        if (notificationsPanel) {
          notificationsPanel.scrollIntoView({
            behavior: "smooth",
            block: "start"
          });
        }

        return;
      }

      openNotificationsModal();
    });
  });
}

/* =========================
   REALTIME
========================= */

function unsubscribeNotificationsRealtime() {
  if (notificationsRealtimeChannel) {
    supabaseClient.removeChannel(notificationsRealtimeChannel);
    notificationsRealtimeChannel = null;
  }
}

function subscribeToNotificationsRealtime() {
  if (!currentUser) return;

  unsubscribeNotificationsRealtime();

  notificationsRealtimeChannel = supabaseClient
    .channel(`notifications-${currentUser.id}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${currentUser.id}`
      },
      async () => {
        await loadNotifications();
      }
    )
    .subscribe();
}

/* =========================
   BOOT
========================= */

async function initNotificationsSystem() {
  setupNotificationsModal();
  setupNotificationButtons();

  const pageMarkAllNotificationsReadBtn = document.getElementById("markAllNotificationsReadBtn");

  if (pageMarkAllNotificationsReadBtn && pageMarkAllNotificationsReadBtn.dataset.markAllReady !== "true") {
    pageMarkAllNotificationsReadBtn.dataset.markAllReady = "true";
    pageMarkAllNotificationsReadBtn.addEventListener("click", markAllNotificationsAsRead);
  }

  if (currentUser) {
    await loadNotifications();
    subscribeToNotificationsRealtime();
  } else {
    notifications = [];
    renderNotifications();
    updateNotificationsBadge();
  }
}

function resetNotificationsSystem() {
  notifications = [];
  renderNotifications();
  updateNotificationsBadge();
  unsubscribeNotificationsRealtime();
}
