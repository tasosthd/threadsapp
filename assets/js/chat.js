/* Loomyva Real-time Chat
   Requires Supabase Auth + these tables: chat_conversations, chat_participants, chat_messages.
*/
let chatCurrentUser = null;
let chatProfiles = [];
let chatConversations = [];
let activeConversationId = null;
let activeRealtimeChannel = null;
let allMessagesChannel = null;
let chatBooted = false;

function chatT(key, fallback) {
  return typeof t === "function" ? t(key) : fallback;
}

function chatEscape(value) {
  if (typeof escapeHTML === "function") return escapeHTML(value);
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function chatAvatar(profile) {
  if (profile?.avatar_url) return profile.avatar_url;
  if (typeof fallbackAvatar === "function") return fallbackAvatar(profile?.full_name || profile?.username || "Loomyva");
  return "/assets/img/index.png";
}

function chatName(profile) {
  return profile?.full_name || profile?.username || "Loomyva User";
}

function chatStartOfLocalDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function chatClockTime(date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

function chatCalendarDate(date) {
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).replace(/,/g, "");
}

function chatExactDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const today = chatStartOfLocalDay(new Date());
  const messageDay = chatStartOfLocalDay(date);
  const diffDays = Math.round((today.getTime() - messageDay.getTime()) / 86400000);
  const time = chatClockTime(date);

  if (diffDays === 0) return `Today, ${time}`;
  if (diffDays === 1) return `Yesterday, ${time}`;
  return `${chatCalendarDate(date)}, ${time}`;
}

function chatCompactDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const today = chatStartOfLocalDay(new Date());
  const messageDay = chatStartOfLocalDay(date);
  const diffDays = Math.round((today.getTime() - messageDay.getTime()) / 86400000);

  // Today -> just the time (15:25). Yesterday -> "Yesterday".
  // Older -> short date (02 Jun). Keeps inbox cards from overflowing on phones.
  if (diffDays === 0) return chatClockTime(date);
  if (diffDays === 1) return chatT("yesterday", "Yesterday");
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function chatShortPreview(value, maxLength = 76) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}…`;
}

function getConversationLastMessage(conversation) {
  const messages = conversation?.chat_messages || [];
  return messages
    .slice()
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0] || null;
}


async function getChatUser() {
  const { data } = await supabaseClient.auth.getUser();
  chatCurrentUser = data?.user || null;
  return chatCurrentUser;
}

async function loadChatProfiles() {
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("id, username, full_name, avatar_url, bio")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Chat profiles error:", error);
    chatProfiles = [];
    return;
  }

  chatProfiles = data || [];
}

function getProfileById(id) {
  return chatProfiles.find((profile) => profile.id === id) || null;
}

function otherParticipant(conversation) {
  const ids = (conversation.chat_participants || []).map((p) => p.user_id);
  return ids.find((id) => id !== chatCurrentUser?.id) || null;
}

async function loadConversations() {
  if (!chatCurrentUser) return;

  const { data, error } = await supabaseClient
    .from("chat_conversations")
    .select("id, updated_at, created_at, chat_participants(user_id), chat_messages(id, body, sender_id, created_at)")
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("Load conversations error:", error);
    chatConversations = [];
    return;
  }

  chatConversations = (data || []).filter((conversation) => {
    return (conversation.chat_participants || []).some((p) => p.user_id === chatCurrentUser.id);
  });
}

async function ensureConversation(otherUserId) {
  if (!chatCurrentUser || !otherUserId || otherUserId === chatCurrentUser.id) return null;

  const existing = chatConversations.find((conversation) => {
    const ids = (conversation.chat_participants || []).map((p) => p.user_id).sort().join(":");
    return ids === [chatCurrentUser.id, otherUserId].sort().join(":");
  });

  if (existing) return existing.id;

  const { data: conversation, error: conversationError } = await supabaseClient
    .from("chat_conversations")
    .insert({ created_by: chatCurrentUser.id })
    .select("id")
    .single();

  if (conversationError) throw conversationError;

  const { error: participantError } = await supabaseClient
    .from("chat_participants")
    .insert([
      { conversation_id: conversation.id, user_id: chatCurrentUser.id },
      { conversation_id: conversation.id, user_id: otherUserId }
    ]);

  if (participantError) throw participantError;

  await loadConversations();
  return conversation.id;
}

function renderChatPeople() {
  const peopleWrap = document.getElementById("chatPeopleList");
  const input = document.getElementById("chatSearchInput");
  if (!peopleWrap) return;

  const query = String(input?.value || "").toLowerCase().replace(/^@/, "").trim();
  const people = chatProfiles
    .filter((profile) => profile.id !== chatCurrentUser?.id)
    .filter((profile) => {
      if (!query) return true;
      return String(profile.username || "").toLowerCase().includes(query) ||
        String(profile.full_name || "").toLowerCase().includes(query);
    })
    .slice(0, 12);

  if (!people.length) {
    peopleWrap.innerHTML = `<div class="chat-empty-mini">${chatT("chatNoPeople", "No people found.")}</div>`;
    return;
  }

  peopleWrap.innerHTML = people.map((profile) => `
    <button class="chat-person-btn" type="button" data-chat-user-id="${chatEscape(profile.id)}">
      <img src="${chatEscape(chatAvatar(profile))}" alt="${chatEscape(chatName(profile))} avatar" />
      <span>
        <strong>${chatEscape(chatName(profile))}</strong>
        <small>@${chatEscape(profile.username || "user")}</small>
      </span>
    </button>
  `).join("");

  peopleWrap.querySelectorAll("[data-chat-user-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      navigateToChatWithUser(button.dataset.chatUserId);
    });
  });
}

function renderChatFriends() {
  const wrap = document.getElementById("chatFriendsList");
  const count = document.getElementById("chatFriendsCount");
  if (!wrap) return;

  if (!chatCurrentUser) {
    if (count) count.textContent = "0";
    wrap.innerHTML = `<div class="chat-friends-empty">${chatT("chatSignInText", "Sign in to use real-time chat.")}</div>`;
    return;
  }

  const people = chatProfiles.filter((profile) => profile.id !== chatCurrentUser?.id);

  if (count) count.textContent = String(people.length);

  if (!people.length) {
    wrap.innerHTML = `<div class="chat-friends-empty">${chatT("chatNoPeople", "No people found yet.")}</div>`;
    return;
  }

  wrap.innerHTML = people.map((profile) => `
    <button class="chat-friend-chip" type="button" data-chat-friend-id="${chatEscape(profile.id)}" aria-label="Message ${chatEscape(chatName(profile))}">
      <img src="${chatEscape(chatAvatar(profile))}" alt="${chatEscape(chatName(profile))} avatar" />
      <span class="chat-friend-name">${chatEscape(chatName(profile))}</span>
    </button>
  `).join("");

  wrap.querySelectorAll("[data-chat-friend-id]").forEach((button) => {
    button.addEventListener("click", () => navigateToChatWithUser(button.dataset.chatFriendId));
  });
}

function renderConversationList() {
  const list = document.getElementById("chatConversationList");
  if (!list) return;

  if (!chatCurrentUser) {
    list.innerHTML = `<div class="chat-empty-mini">${chatT("chatSignInText", "Sign in to use real-time chat.")}</div>`;
    return;
  }

  if (!chatConversations.length) {
    list.innerHTML = `<div class="chat-empty-mini">${chatT("chatNoConversations", "No conversations yet. Search someone and start the money-network effect.")}</div>`;
    return;
  }

  list.innerHTML = chatConversations.map((conversation) => {
    const otherId = otherParticipant(conversation);
    const profile = getProfileById(otherId);
    const last = getConversationLastMessage(conversation);
    const active = conversation.id === activeConversationId ? "active" : "";
    const preview = last ? chatShortPreview(last.body, 54) : chatT("chatNewConversation", "New conversation");
    const time = chatCompactDateTime(last?.created_at || conversation.updated_at || conversation.created_at);

    return `
      <button class="chat-conversation-btn ${active}" type="button" data-conversation-id="${chatEscape(conversation.id)}">
        <img src="${chatEscape(chatAvatar(profile))}" alt="${chatEscape(chatName(profile))} avatar" />
        <span class="chat-conversation-copy">
          <strong>${chatEscape(chatName(profile))}</strong>
          <small>${chatEscape(preview)}</small>
        </span>
        <em class="chat-conversation-time">${chatEscape(time)}</em>
      </button>
    `;
  }).join("");

  list.querySelectorAll("[data-conversation-id]").forEach((button) => {
    button.addEventListener("click", () => navigateToChatConversation(button.dataset.conversationId));
  });

  renderLatestChatsPanel();
}

function renderLatestChatsPanel() {
  const panel = document.getElementById("latestChatsPanel");
  const list = document.getElementById("latestChatsList");
  const count = document.getElementById("latestChatsCount");
  if (!panel || !list) return;

  panel.classList.remove("hidden");

  if (!chatCurrentUser) {
    if (count) count.textContent = "0";
    list.innerHTML = `
      <div class="latest-chat-empty">
        <strong>${chatT("chatSignInTitle", "Sign in to chat")}</strong>
        <span>${chatT("chatSignInText", "Sign in to use real-time chat.")}</span>
      </div>
    `;
    return;
  }

  const conversations = chatConversations
    .slice()
    .sort((a, b) => {
      const aLast = getConversationLastMessage(a)?.created_at || a.updated_at || a.created_at;
      const bLast = getConversationLastMessage(b)?.created_at || b.updated_at || b.created_at;
      return new Date(bLast) - new Date(aLast);
    });

  if (count) count.textContent = String(conversations.length);

  if (!conversations.length) {
    list.innerHTML = `
      <div class="latest-chat-empty">
        <strong>${chatT("chatNoConversationsTitle", "No chats yet")}</strong>
        <span>${chatT("chatNoConversations", "No conversations yet. Search someone and start the money-network effect.")}</span>
      </div>
    `;
    return;
  }

  list.innerHTML = conversations.map((conversation) => {
    const otherId = otherParticipant(conversation);
    const profile = getProfileById(otherId);
    const last = getConversationLastMessage(conversation);
    const active = conversation.id === activeConversationId ? "active" : "";
    const preview = last ? chatShortPreview(last.body, 92) : chatT("chatNewConversation", "New conversation");
    const time = chatCompactDateTime(last?.created_at || conversation.updated_at || conversation.created_at);

    return `
      <button class="latest-chat-card ${active}" type="button" data-latest-conversation-id="${chatEscape(conversation.id)}">
        <img src="${chatEscape(chatAvatar(profile))}" alt="${chatEscape(chatName(profile))} avatar" />
        <span class="latest-chat-meta">
          <strong>${chatEscape(chatName(profile))}</strong>
          <small>${chatEscape(preview)}</small>
        </span>
        <span class="latest-chat-side">
          <em title="${chatEscape(time)}">${chatEscape(time)}</em>
          <b>↗</b>
        </span>
      </button>
    `;
  }).join("");

  list.querySelectorAll("[data-latest-conversation-id]").forEach((button) => {
    button.addEventListener("click", () => {
      navigateToChatConversation(button.dataset.latestConversationId);
    });
  });
}

async function openConversationWithUser(otherUserId) {
  try {
    const conversationId = await ensureConversation(otherUserId);
    await openConversation(conversationId);
  } catch (error) {
    console.error("Open conversation with user error:", error);
    showChatStatus(chatT("chatStartError", "Could not start chat."), true);
  }
}

async function openConversation(conversationId) {
  activeConversationId = conversationId;
  renderConversationList();
  renderChatHeader();
  await loadMessages(conversationId);
  subscribeToConversation(conversationId);
}

function renderChatHeader() {
  const header = document.getElementById("chatActiveHeader");
  if (!header) return;

  const conversation = chatConversations.find((item) => item.id === activeConversationId);
  const profile = getProfileById(otherParticipant(conversation || {}));

  if (!conversation || !profile) {
    header.innerHTML = `
      <div class="chat-active-placeholder">
        <strong>${chatT("chatPickConversation", "Pick a conversation")}</strong>
        <span>${chatT("chatPickConversationText", "Messages will appear live here.")}</span>
      </div>
    `;
    return;
  }

  const onChatPage = window.location.pathname.toLowerCase().startsWith("/chat");

  // Back button: an arrow icon ("<") that returns to the inbox.
  const backButton = onChatPage
    ? `
      <button class="chat-back-link" type="button" data-chat-back aria-label="${chatT("backToMessages", "Back to messages")}">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M15.5 4.5a1 1 0 0 1 0 1.4L9.4 12l6.1 6.1a1 1 0 1 1-1.4 1.4l-6.8-6.8a1 1 0 0 1 0-1.4l6.8-6.8a1 1 0 0 1 1.4 0Z"/>
        </svg>
      </button>
    `
    : "";

  // Name + profile picture shown on the top-right of the chat header.
  header.innerHTML = `
    ${backButton}
    <div class="chat-active-peer">
      <div class="chat-active-peer-copy">
        <strong>${chatEscape(chatName(profile))}</strong>
        <span>@${chatEscape(profile.username || "user")}</span>
      </div>
      <img class="chat-active-peer-avatar" src="${chatEscape(chatAvatar(profile))}" alt="${chatEscape(chatName(profile))} avatar" />
    </div>
  `;

  const backBtn = header.querySelector("[data-chat-back]");
  if (backBtn) {
    backBtn.addEventListener("click", () => {
      window.location.href = "/messages/";
    });
  }
}

async function loadMessages(conversationId) {
  const wrap = document.getElementById("chatMessages");
  if (!wrap || !conversationId) return;

  wrap.innerHTML = `<div class="chat-loading">${chatT("loading", "Loading...")}</div>`;

  const { data, error } = await supabaseClient
    .from("chat_messages")
    .select("id, conversation_id, sender_id, body, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Messages error:", error);
    wrap.innerHTML = `<div class="chat-empty-mini">${chatT("chatLoadError", "Could not load messages.")}</div>`;
    return;
  }

  renderMessages(data || []);
}

function renderMessages(messages) {
  const wrap = document.getElementById("chatMessages");
  if (!wrap) return;

  if (!activeConversationId) {
    wrap.innerHTML = `<div class="chat-empty-state">${chatT("chatEmptyState", "Choose a chat or search someone to begin.")}</div>`;
    return;
  }

  if (!messages.length) {
    wrap.innerHTML = `<div class="chat-empty-state">${chatT("chatNoMessages", "No messages yet. Send the first one 🚀")}</div>`;
    return;
  }

  wrap.innerHTML = messages.map((message) => {
    const own = message.sender_id === chatCurrentUser?.id ? "own" : "";
    const time = chatExactDateTime(message.created_at);
    return `
      <div class="chat-message ${own}">
        <p class="chat-message-body">${chatEscape(message.body)}</p>
        <small class="chat-message-time">${chatEscape(time)}</small>
      </div>
    `;
  }).join("");

  requestAnimationFrame(() => {
    wrap.scrollTo({ top: wrap.scrollHeight, behavior: "smooth" });
  });
}

function appendMessage(message) {
  if (!message || message.conversation_id !== activeConversationId) return;
  loadMessages(activeConversationId);
}

async function sendChatMessage(event) {
  event.preventDefault();
  const input = document.getElementById("chatMessageInput");
  const body = String(input?.value || "").trim();

  if (!chatCurrentUser) {
    showChatStatus(chatT("chatSignInText", "Sign in to use real-time chat."), true);
    return;
  }

  if (!activeConversationId) {
    showChatStatus(chatT("chatPickFirst", "Pick someone first."), true);
    return;
  }

  if (!body) return;
  if (body.length > 1000) {
    showChatStatus(chatT("chatTooLong", "Keep messages under 1000 characters."), true);
    return;
  }

  const submitBtn = event.currentTarget?.querySelector('button[type="submit"]');
  input.value = "";
  if (submitBtn) submitBtn.disabled = true;

  const { error } = await supabaseClient
    .from("chat_messages")
    .insert({ conversation_id: activeConversationId, sender_id: chatCurrentUser.id, body });

  if (submitBtn) submitBtn.disabled = false;

  if (error) {
    console.error("Send message error:", error);
    input.value = body;
    showChatStatus(chatT("chatSendError", "Message failed."), true);
    return;
  }

  await supabaseClient
    .from("chat_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", activeConversationId);

  await loadConversations();
  renderConversationList();
}

function subscribeToConversation(conversationId) {
  if (activeRealtimeChannel) {
    supabaseClient.removeChannel(activeRealtimeChannel);
  }

  activeRealtimeChannel = supabaseClient
    .channel(`chat_messages_${conversationId}`)
    .on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "chat_messages",
      filter: `conversation_id=eq.${conversationId}`
    }, (payload) => appendMessage(payload.new))
    .subscribe();
}

function subscribeToAllMessages() {
  if (allMessagesChannel) return;

  allMessagesChannel = supabaseClient
    .channel("chat_all_messages")
    .on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "chat_messages"
    }, async () => {
      await loadConversations();
      renderConversationList();
      renderLatestChatsPanel();
    })
    .subscribe();
}

function showChatStatus(message, isError = false) {
  const status = document.getElementById("chatStatus");
  if (!status) return;
  status.textContent = message;
  status.classList.remove("hidden");
  status.classList.toggle("error", Boolean(isError));
  setTimeout(() => status.classList.add("hidden"), 2600);
}

async function initChatPage() {
  if (chatBooted) return;
  chatBooted = true;

  if (typeof supabaseClient === "undefined" || !supabaseClient) {
    console.error("Chat boot stopped: Supabase client is not available.");
    renderLatestChatsPanel();
    return;
  }

  await getChatUser();

  const signInCard = document.getElementById("chatSignInCard");
  const app = document.getElementById("chatApp");

  if (!chatCurrentUser) {
    signInCard?.classList.remove("hidden");
    app?.classList.add("hidden");
    renderChatFriends();
    renderLatestChatsPanel();
    return;
  }

  signInCard?.classList.add("hidden");
  app?.classList.remove("hidden");

  await loadChatProfiles();
  await loadConversations();

  renderChatPeople();
  renderChatFriends();
  renderConversationList();
  renderLatestChatsPanel();
  renderChatHeader();
  renderMessages([]);
  subscribeToAllMessages();

  const params = new URLSearchParams(window.location.search);
  const conversationId = params.get("conversation");
  const userId = params.get("user");

  if (conversationId) {
    const exists = chatConversations.some((conversation) => conversation.id === conversationId);
    if (exists) {
      await openConversation(conversationId);
    } else {
      showChatStatus(chatT("chatLoadError", "Could not load messages."), true);
    }
    return;
  }

  if (userId) {
    await openConversationWithUser(userId);
  }
}

function bindChatPageUI() {
  document.getElementById("chatSearchInput")?.addEventListener("input", renderChatPeople);
  document.getElementById("chatMessageForm")?.addEventListener("submit", sendChatMessage);
  document.querySelectorAll("[data-open-chat-login]").forEach((button) => {
    button.addEventListener("click", () => {
      if (typeof openSidebar === "function") openSidebar();
    });
  });

  window.addEventListener("loomyva:language-change", () => {
    renderChatPeople();
    renderChatFriends();
    renderConversationList();
    renderLatestChatsPanel();
    renderChatHeader();
  });
}

async function bootChat() {
  bindChatPageUI();
  try {
    await initChatPage();
  } catch (error) {
    console.error("Chat boot error:", error);
    renderLatestChatsPanel();
  }
}

function navigateToChatWithUser(userId) {
  if (!userId) return;
  window.location.href = `/chat/?user=${encodeURIComponent(userId)}`;
}

function navigateToChatConversation(conversationId) {
  if (!conversationId) return;
  window.location.href = `/chat/?conversation=${encodeURIComponent(conversationId)}`;
}

function openChatWithUser(userId) {
  navigateToChatWithUser(userId);
}
