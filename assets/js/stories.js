/* =========================================================
   Loomyva Stories — Instagram-style 24h stories
   Requires: Supabase table `stories`, `story_views`, storage bucket `stories`
   ========================================================= */
let loomyvaStories = [];
let loomyvaStoryViews = [];
let activeStoryGroupIndex = 0;
let activeStoryItemIndex = 0;
let storyProgressTimer = null;
let storyProgressStartedAt = 0;
let storyProgressDuration = 6000;
let storiesRealtimeChannel = null;
let storyUploadFile = null;

function storySafe(value) {
  return typeof escapeHTML === "function"
    ? escapeHTML(value)
    : String(value || "").replace(/[&<>\"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}

function getStoryProfile(userId) {
  if (typeof getProfileByUserId === "function") return getProfileByUserId(userId);
  return Array.isArray(profiles) ? profiles.find((profile) => profile.id === userId) : null;
}

function getStoryAvatar(userId) {
  const profile = getStoryProfile(userId);
  const name = profile?.full_name || profile?.username || "Loomyva";
  return profile?.avatar_url || (typeof fallbackAvatar === "function" ? fallbackAvatar(name) : "");
}

function getStoryName(userId) {
  const profile = getStoryProfile(userId);
  if (currentUser?.id === userId) return "Your story";
  return profile?.full_name || profile?.username || "Loomyva user";
}

function getStoryUsername(userId) {
  const profile = getStoryProfile(userId);
  return profile?.username ? `@${profile.username}` : "@loomyva";
}

function getStoryGroups() {
  const grouped = new Map();

  loomyvaStories.forEach((story) => {
    if (!grouped.has(story.user_id)) grouped.set(story.user_id, []);
    grouped.get(story.user_id).push(story);
  });

  const groups = Array.from(grouped.entries()).map(([userId, items]) => ({
    userId,
    items: items.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
    latest: items.reduce((latest, item) => {
      return new Date(item.created_at) > new Date(latest.created_at) ? item : latest;
    }, items[0])
  }));

  groups.sort((a, b) => {
    if (currentUser?.id === a.userId) return -1;
    if (currentUser?.id === b.userId) return 1;
    return new Date(b.latest.created_at) - new Date(a.latest.created_at);
  });

  return groups;
}

function hasViewedStory(storyId) {
  if (!currentUser) return false;
  return loomyvaStoryViews.some((view) => view.story_id === storyId && view.viewer_id === currentUser.id);
}

function hasUnseenStories(group) {
  if (!currentUser) return true;
  return group.items.some((story) => !hasViewedStory(story.id));
}

function getStoryViewsCount(storyId) {
  return loomyvaStoryViews.filter((view) => view.story_id === storyId).length;
}

function renderStoriesTray() {
  const tray = document.getElementById("storiesTray");
  if (!tray) return;

  const groups = getStoryGroups();
  const createAvatar = currentProfile?.avatar_url || (currentUser ? getStoryAvatar(currentUser.id) : (typeof fallbackAvatar === "function" ? fallbackAvatar("Loomyva") : ""));

  const createTile = `
    <button class="story-tile story-create-tile" type="button" data-create-story="true" aria-label="Create story">
      <span class="story-avatar-wrap story-create-wrap">
        <img src="${storySafe(createAvatar)}" alt="Your avatar" />
        <span class="story-plus">+</span>
      </span>
      <span class="story-label">${currentUser ? "Your story" : "Sign in"}</span>
    </button>
  `;

  const storyTiles = groups.map((group, index) => {
    const unseen = hasUnseenStories(group);
    const avatar = getStoryAvatar(group.userId);
    const label = getStoryName(group.userId);

    return `
      <button class="story-tile" type="button" data-open-story-group="${index}" aria-label="Open ${storySafe(label)} stories">
        <span class="story-avatar-wrap ${unseen ? "unseen" : "seen"}">
          <img src="${storySafe(avatar)}" alt="${storySafe(label)} avatar" loading="lazy" />
        </span>
        <span class="story-label">${storySafe(label)}</span>
      </button>
    `;
  }).join("");

  tray.innerHTML = createTile + storyTiles;
}

async function loadStories() {
  const tray = document.getElementById("storiesTray");
  if (!tray || typeof supabaseClient === "undefined") return;

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const storiesRequest = supabaseClient
    .from("stories")
    .select("*")
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  const viewsRequest = currentUser
    ? supabaseClient.from("story_views").select("*")
    : Promise.resolve({ data: [], error: null });

  const [storiesResponse, viewsResponse] = await Promise.all([storiesRequest, viewsRequest]);

  if (storiesResponse.error) {
    tray.innerHTML = `
      <div class="stories-warning">
        <strong>Stories need setup</strong>
        <span>Run loomyva-stories-supabase.sql in Supabase.</span>
      </div>
    `;
    return;
  }

  loomyvaStories = storiesResponse.data || [];
  loomyvaStoryViews = viewsResponse.error ? [] : (viewsResponse.data || []);
  renderStoriesTray();
}

function getStoryExtension(file) {
  const fromName = file.name?.split(".").pop()?.toLowerCase();
  if (fromName) return fromName;
  return { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" }[file.type] || "jpg";
}

async function uploadStoryImage(file) {
  const extension = getStoryExtension(file);
  const path = `${currentUser.id}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;

  const { error: uploadError } = await supabaseClient.storage
    .from("stories")
    .upload(path, file, { cacheControl: "3600", upsert: false });

  if (uploadError) throw uploadError;

  const { data } = supabaseClient.storage.from("stories").getPublicUrl(path);
  return data?.publicUrl || null;
}

function openStoryComposer() {
  if (!currentUser) {
    if (typeof openSidebar === "function") openSidebar();
    if (typeof setStatus === "function") setStatus("Sign in first to create a story.", "error");
    return;
  }

  const modal = document.getElementById("storyComposerModal");
  const input = document.getElementById("storyUploadInput");
  const preview = document.getElementById("storyUploadPreview");
  const submit = document.getElementById("storyPublishBtn");

  storyUploadFile = null;
  if (input) input.value = "";
  if (preview) {
    preview.src = "";
    preview.classList.add("hidden");
  }
  if (submit) submit.disabled = true;
  modal?.classList.remove("hidden");
  modal?.setAttribute("aria-hidden", "false");
}

function closeStoryComposer() {
  const modal = document.getElementById("storyComposerModal");
  modal?.classList.add("hidden");
  modal?.setAttribute("aria-hidden", "true");
  storyUploadFile = null;
}

function handleStoryFileSelect(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (!allowed.includes(file.type)) {
    if (typeof setStatus === "function") setStatus("Stories support JPG, PNG, WEBP, or GIF.", "error");
    return;
  }

  if (file.size > 8 * 1024 * 1024) {
    if (typeof setStatus === "function") setStatus("Story image must be under 8MB.", "error");
    return;
  }

  storyUploadFile = file;
  const preview = document.getElementById("storyUploadPreview");
  const submit = document.getElementById("storyPublishBtn");
  if (preview) {
    preview.src = URL.createObjectURL(file);
    preview.classList.remove("hidden");
  }
  if (submit) submit.disabled = false;
}

async function publishStory() {
  const submit = document.getElementById("storyPublishBtn");
  const captionInput = document.getElementById("storyCaptionInput");
  if (!currentUser || !storyUploadFile) return;

  try {
    if (submit) {
      submit.disabled = true;
      submit.textContent = "Uploading...";
    }

    const mediaUrl = await uploadStoryImage(storyUploadFile);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { error } = await supabaseClient.from("stories").insert({
      user_id: currentUser.id,
      media_url: mediaUrl,
      caption: captionInput?.value?.trim().slice(0, 140) || "",
      expires_at: expiresAt
    });

    if (error) throw error;

    if (captionInput) captionInput.value = "";
    closeStoryComposer();
    await loadStories();
    if (typeof setStatus === "function") setStatus("Story posted for 24 hours 🚀", "success");
  } catch (error) {
    if (typeof setStatus === "function") setStatus(error.message || "Could not publish story.", "error");
  } finally {
    if (submit) {
      submit.textContent = "Publish story";
      submit.disabled = !storyUploadFile;
    }
  }
}

async function markStoryViewed(story) {
  if (!currentUser || !story?.id || story.user_id === currentUser.id || hasViewedStory(story.id)) return;

  const { error } = await supabaseClient
    .from("story_views")
    .upsert({ story_id: story.id, viewer_id: currentUser.id }, { onConflict: "story_id,viewer_id" });

  if (!error) {
    loomyvaStoryViews.push({ story_id: story.id, viewer_id: currentUser.id, viewed_at: new Date().toISOString() });
    renderStoriesTray();
  }
}

function renderStoryViewer() {
  const groups = getStoryGroups();
  const group = groups[activeStoryGroupIndex];
  const story = group?.items?.[activeStoryItemIndex];
  const modal = document.getElementById("storyViewerModal");
  const frame = document.getElementById("storyViewerFrame");

  if (!modal || !frame || !story) return;

  const bars = group.items.map((_, index) => `<span class="story-progress-segment ${index < activeStoryItemIndex ? "complete" : ""}"><span ${index === activeStoryItemIndex ? "id=\"activeStoryProgress\"" : ""}></span></span>`).join("");
  const owner = story.user_id === currentUser?.id;
  const viewsText = owner ? `${getStoryViewsCount(story.id)} views` : "";

  frame.innerHTML = `
    <div class="story-progress-row">${bars}</div>
    <div class="story-viewer-head">
      <div class="story-viewer-user">
        <img src="${storySafe(getStoryAvatar(group.userId))}" alt="${storySafe(getStoryName(group.userId))} avatar" />
        <div>
          <strong>${storySafe(getStoryName(group.userId))}</strong>
          <span>${storySafe(getStoryUsername(group.userId))}</span>
        </div>
      </div>
      <button class="story-viewer-close" type="button" data-close-story-viewer="true" aria-label="Close stories">×</button>
    </div>
    <img class="story-viewer-media" src="${storySafe(story.media_url)}" alt="Story image" />
    ${story.caption ? `<p class="story-viewer-caption">${storySafe(story.caption)}</p>` : ""}
    ${viewsText ? `<span class="story-viewer-views">${storySafe(viewsText)}</span>` : ""}
    <button class="story-nav-area story-nav-prev" type="button" data-story-prev="true" aria-label="Previous story"></button>
    <button class="story-nav-area story-nav-next" type="button" data-story-next="true" aria-label="Next story"></button>
  `;

  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  markStoryViewed(story);
  startStoryProgress();
}

function openStoryGroup(index) {
  activeStoryGroupIndex = Number(index) || 0;
  const groups = getStoryGroups();
  const group = groups[activeStoryGroupIndex];
  if (!group) return;

  const firstUnseen = currentUser ? group.items.findIndex((story) => !hasViewedStory(story.id)) : -1;
  activeStoryItemIndex = firstUnseen >= 0 ? firstUnseen : 0;
  renderStoryViewer();
}

function closeStoryViewer() {
  clearInterval(storyProgressTimer);
  storyProgressTimer = null;
  const modal = document.getElementById("storyViewerModal");
  modal?.classList.add("hidden");
  modal?.setAttribute("aria-hidden", "true");
}

function showNextStory() {
  const groups = getStoryGroups();
  const group = groups[activeStoryGroupIndex];
  if (!group) return closeStoryViewer();

  if (activeStoryItemIndex < group.items.length - 1) {
    activeStoryItemIndex += 1;
    renderStoryViewer();
    return;
  }

  if (activeStoryGroupIndex < groups.length - 1) {
    activeStoryGroupIndex += 1;
    activeStoryItemIndex = 0;
    renderStoryViewer();
    return;
  }

  closeStoryViewer();
}

function showPreviousStory() {
  const groups = getStoryGroups();
  if (activeStoryItemIndex > 0) {
    activeStoryItemIndex -= 1;
    renderStoryViewer();
    return;
  }

  if (activeStoryGroupIndex > 0) {
    activeStoryGroupIndex -= 1;
    const previousGroup = groups[activeStoryGroupIndex];
    activeStoryItemIndex = Math.max((previousGroup?.items?.length || 1) - 1, 0);
    renderStoryViewer();
  }
}

function startStoryProgress() {
  clearInterval(storyProgressTimer);
  storyProgressStartedAt = Date.now();
  const progress = document.getElementById("activeStoryProgress");
  if (progress) progress.style.width = "0%";

  storyProgressTimer = setInterval(() => {
    const elapsed = Date.now() - storyProgressStartedAt;
    const percent = Math.min((elapsed / storyProgressDuration) * 100, 100);
    const active = document.getElementById("activeStoryProgress");
    if (active) active.style.width = `${percent}%`;
    if (percent >= 100) showNextStory();
  }, 80);
}

function mountStoryModals() {
  if (document.getElementById("storyViewerModal")) return;

  document.body.insertAdjacentHTML("beforeend", `
    <div id="storyComposerModal" class="story-modal hidden" aria-hidden="true">
      <div class="story-composer-card" role="dialog" aria-modal="true" aria-label="Create story">
        <button class="story-modal-close" type="button" data-close-story-composer="true" aria-label="Close story composer">×</button>
        <span class="eyebrow">Loomyva Stories</span>
        <h2>Create a 24h story</h2>
        <p>Upload a clean image, add a short caption, and stay top-of-feed for attention.</p>
        <img id="storyUploadPreview" class="story-upload-preview hidden" src="" alt="Story preview" />
        <input id="storyUploadInput" class="hidden" type="file" accept="image/jpeg,image/png,image/webp,image/gif" />
        <button class="btn ghost-btn" type="button" data-pick-story-image="true">Choose image</button>
        <input id="storyCaptionInput" class="story-caption-input" type="text" maxlength="140" placeholder="Caption (optional)" />
        <button id="storyPublishBtn" class="btn primary-btn" type="button" disabled>Publish story</button>
      </div>
    </div>
    <div id="storyViewerModal" class="story-viewer-modal hidden" aria-hidden="true">
      <div id="storyViewerFrame" class="story-viewer-frame" role="dialog" aria-modal="true" aria-label="Story viewer"></div>
    </div>
  `);
}

function bindStoriesUI() {
  document.addEventListener("click", (event) => {
    const createBtn = event.target.closest("[data-create-story]");
    const groupBtn = event.target.closest("[data-open-story-group]");
    const closeComposer = event.target.closest("[data-close-story-composer]");
    const pickStory = event.target.closest("[data-pick-story-image]");
    const publish = event.target.closest("#storyPublishBtn");
    const closeViewer = event.target.closest("[data-close-story-viewer]");
    const next = event.target.closest("[data-story-next]");
    const prev = event.target.closest("[data-story-prev]");

    if (createBtn) openStoryComposer();
    if (groupBtn) openStoryGroup(groupBtn.dataset.openStoryGroup);
    if (closeComposer) closeStoryComposer();
    if (pickStory) document.getElementById("storyUploadInput")?.click();
    if (publish) publishStory();
    if (closeViewer) closeStoryViewer();
    if (next) showNextStory();
    if (prev) showPreviousStory();
  });

  document.addEventListener("change", (event) => {
    if (event.target?.id === "storyUploadInput") handleStoryFileSelect(event);
  });

  document.addEventListener("keydown", (event) => {
    const viewerOpen = !document.getElementById("storyViewerModal")?.classList.contains("hidden");
    if (!viewerOpen) return;
    if (event.key === "Escape") closeStoryViewer();
    if (event.key === "ArrowRight") showNextStory();
    if (event.key === "ArrowLeft") showPreviousStory();
  });
}

function subscribeToStoriesRealtime() {
  if (storiesRealtimeChannel || typeof supabaseClient === "undefined") return;
  storiesRealtimeChannel = supabaseClient
    .channel("loomyva-stories-realtime")
    .on("postgres_changes", { event: "*", schema: "public", table: "stories" }, loadStories)
    .on("postgres_changes", { event: "*", schema: "public", table: "story_views" }, loadStories)
    .subscribe();
}

async function initStoriesSystem() {
  mountStoryModals();
  bindStoriesUI();
  await loadStories();
  subscribeToStoriesRealtime();
}
