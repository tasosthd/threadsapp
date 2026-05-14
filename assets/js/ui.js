let selectedThreadImageFile = null;

function getPageName() {
  const path = window.location.pathname.toLowerCase();

  if (path === "/profile/" || path === "/profile") {
    return "profile";
  }

  return "home";
}

function setStatus(message, type = "") {
  const statusMsg = document.getElementById("statusMsg");

  if (!statusMsg) return;

  statusMsg.textContent = message || "";
  statusMsg.className = "status-msg";

  if (type) {
    statusMsg.classList.add(type);
  }
}

function escapeHTML(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(dateValue) {
  const date = new Date(dateValue);

  return date.toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function fallbackAvatar(seed) {
  return `https://api.dicebear.com/8.x/initials/svg?seed=${encodeURIComponent(seed || "User")}`;
}

function cleanUsername(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/^@+/, "")
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 28);
}

function setBottomNavActive(section) {
  const bottomHomeBtn = document.getElementById("bottomHomeBtn");
  const bottomProfileBtn = document.getElementById("bottomProfileBtn");

  if (!bottomHomeBtn || !bottomProfileBtn) return;

  bottomHomeBtn.classList.toggle("active", section === "home");
  bottomProfileBtn.classList.toggle("active", section === "profile");
}

function goHomePage() {
  window.location.href = "/";
}

function goProfilePage() {
  window.location.href = "/profile/";
}

/* =========================
   SIDEBAR
========================= */

function openSidebar() {
  const appSidebar = document.getElementById("appSidebar");
  const sidebarBackdrop = document.getElementById("sidebarBackdrop");

  if (!appSidebar || !sidebarBackdrop) return;

  appSidebar.classList.add("active");
  sidebarBackdrop.classList.add("active");

  appSidebar.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeSidebar() {
  const appSidebar = document.getElementById("appSidebar");
  const sidebarBackdrop = document.getElementById("sidebarBackdrop");

  if (!appSidebar || !sidebarBackdrop) return;

  appSidebar.classList.remove("active");
  sidebarBackdrop.classList.remove("active");

  appSidebar.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

function setupSidebar() {
  const sidebarOpenBtn = document.getElementById("sidebarOpenBtn");
  const sidebarCloseBtn = document.getElementById("sidebarCloseBtn");
  const sidebarBackdrop = document.getElementById("sidebarBackdrop");
  const sidebarComposeBtn = document.getElementById("sidebarComposeBtn");

  if (sidebarOpenBtn) {
    sidebarOpenBtn.addEventListener("click", openSidebar);
  }

  if (sidebarCloseBtn) {
    sidebarCloseBtn.addEventListener("click", closeSidebar);
  }

  if (sidebarBackdrop) {
    sidebarBackdrop.addEventListener("click", closeSidebar);
  }

  if (sidebarComposeBtn) {
    sidebarComposeBtn.addEventListener("click", () => {
      closeSidebar();

      if (getPageName() !== "home") {
        window.location.href = "/?compose=1";
        return;
      }

      if (typeof openThreadModal === "function") {
        openThreadModal();
      }
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeSidebar();
    }
  });
}

/* =========================
   BOTTOM NAV
========================= */

function setupBottomNav() {
  const pageName = getPageName();

  const bottomHomeBtn = document.getElementById("bottomHomeBtn");
  const bottomComposeBtn = document.getElementById("bottomComposeBtn");
  const bottomProfileBtn = document.getElementById("bottomProfileBtn");

  setBottomNavActive(pageName);

  if (bottomHomeBtn) {
    bottomHomeBtn.addEventListener("click", () => {
      if (pageName === "home") {
        const feedPanel = document.querySelector(".feed-panel");

        if (feedPanel) {
          feedPanel.scrollIntoView({
            behavior: "smooth",
            block: "start"
          });
        }

        if (typeof closePublicProfile === "function") {
          closePublicProfile();
        }

        return;
      }

      goHomePage();
    });
  }

  if (bottomComposeBtn) {
    bottomComposeBtn.addEventListener("click", () => {
      if (pageName !== "home") {
        window.location.href = "/?compose=1";
        return;
      }

      if (typeof openThreadModal === "function") {
        openThreadModal();
      }
    });
  }

  if (bottomProfileBtn) {
    bottomProfileBtn.addEventListener("click", () => {
      if (pageName === "profile") {
        const profileEditor = document.querySelector(".profile-editor-card");

        if (profileEditor) {
          profileEditor.scrollIntoView({
            behavior: "smooth",
            block: "center"
          });
        }

        return;
      }

      goProfilePage();
    });
  }
}

/* =========================
   POST MODAL
========================= */

function openThreadModal() {
  const modalBackdrop = document.getElementById("threadModalBackdrop");
  const modalTextarea = document.getElementById("modalThreadInput");

  if (!modalBackdrop) return;

  if (typeof currentUser !== "undefined" && !currentUser) {
    setStatus("Sign in first to create a thread.", "error");

    if (typeof signInWithGoogle === "function") {
      signInWithGoogle();
    }

    return;
  }

  modalBackdrop.classList.add("active");
  modalBackdrop.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";

  setTimeout(() => {
    if (modalTextarea) {
      modalTextarea.focus();
    }
  }, 180);
}

function closeThreadModal() {
  const modalBackdrop = document.getElementById("threadModalBackdrop");

  if (!modalBackdrop) return;

  modalBackdrop.classList.remove("active");
  modalBackdrop.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";

  resetThreadImagePicker();
}

/* =========================
   IMAGE PICKER
========================= */

function resetThreadImagePicker() {
  selectedThreadImageFile = null;

  const modalImageInput = document.getElementById("modalImageInput");
  const modalImagePreviewWrap = document.getElementById("modalImagePreviewWrap");
  const modalImagePreview = document.getElementById("modalImagePreview");
  const modalImageName = document.getElementById("modalImageName");

  if (modalImageInput) {
    modalImageInput.value = "";
  }

  if (modalImagePreview) {
    modalImagePreview.src = "";
  }

  if (modalImageName) {
    modalImageName.textContent = "";
  }

  if (modalImagePreviewWrap) {
    modalImagePreviewWrap.classList.add("hidden");
  }
}

function handleThreadImageSelect(event) {
  const file = event.target.files?.[0];

  if (!file) {
    resetThreadImagePicker();
    return;
  }

  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];

  if (!allowedTypes.includes(file.type)) {
    setStatus("Please upload a JPG, PNG, WEBP, or GIF image.", "error");
    resetThreadImagePicker();
    return;
  }

  const maxSizeInMB = 6;
  const maxSizeInBytes = maxSizeInMB * 1024 * 1024;

  if (file.size > maxSizeInBytes) {
    setStatus(`Image must be under ${maxSizeInMB}MB.`, "error");
    resetThreadImagePicker();
    return;
  }

  selectedThreadImageFile = file;

  const modalImagePreviewWrap = document.getElementById("modalImagePreviewWrap");
  const modalImagePreview = document.getElementById("modalImagePreview");
  const modalImageName = document.getElementById("modalImageName");

  const previewUrl = URL.createObjectURL(file);

  if (modalImagePreview) {
    modalImagePreview.src = previewUrl;
  }

  if (modalImageName) {
    modalImageName.textContent = file.name;
  }

  if (modalImagePreviewWrap) {
    modalImagePreviewWrap.classList.remove("hidden");
  }

  setStatus("");
}

function updateModalCharCount() {
  const modalThreadInput = document.getElementById("modalThreadInput");
  const modalCharCount = document.getElementById("modalCharCount");

  if (!modalThreadInput || !modalCharCount) return;

  modalCharCount.textContent = `${modalThreadInput.value.length} / 280`;
}

function setupThreadModal() {
  const modalBackdrop = document.getElementById("threadModalBackdrop");
  const modalCloseBtn = document.getElementById("modalCloseBtn");
  const modalThreadInput = document.getElementById("modalThreadInput");
  const modalUploadBtn = document.getElementById("modalUploadBtn");
  const modalImageInput = document.getElementById("modalImageInput");
  const modalRemoveImageBtn = document.getElementById("modalRemoveImageBtn");

  if (!modalBackdrop) return;

  if (modalCloseBtn) {
    modalCloseBtn.addEventListener("click", closeThreadModal);
  }

  modalBackdrop.addEventListener("click", (event) => {
    if (event.target === modalBackdrop) {
      closeThreadModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modalBackdrop.classList.contains("active")) {
      closeThreadModal();
    }
  });

  if (modalThreadInput) {
    modalThreadInput.addEventListener("input", updateModalCharCount);
  }

  if (modalImageInput) {
    modalImageInput.addEventListener("change", handleThreadImageSelect);
  }

  if (modalRemoveImageBtn) {
    modalRemoveImageBtn.addEventListener("click", resetThreadImagePicker);
  }

  if (modalUploadBtn) {
    modalUploadBtn.addEventListener("click", async () => {
      if (typeof uploadThreadFromModal === "function") {
        await uploadThreadFromModal();
      }
    });
  }

  updateModalCharCount();
}

/* =========================
   RENDER SHARED UI
========================= */

function renderBottomNav() {
  return `
    <nav class="bottom-nav" aria-label="Bottom navigation">
      <button id="bottomHomeBtn" class="bottom-nav-btn" type="button">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 11.5 12 4l9 7.5V21a1 1 0 0 1-1 1h-5.5v-6h-5v6H4a1 1 0 0 1-1-1v-9.5Z"></path>
        </svg>
        <span>Home</span>
      </button>

      <button id="bottomComposeBtn" class="bottom-nav-main" type="button" aria-label="Create thread">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 5a1 1 0 0 1 1 1v5h5a1 1 0 1 1 0 2h-5v5a1 1 0 1 1-2 0v-5H6a1 1 0 1 1 0-2h5V6a1 1 0 0 1 1-1Z"></path>
        </svg>
      </button>

      <button id="bottomProfileBtn" class="bottom-nav-btn" type="button">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm0 2c-4.42 0-8 2.24-8 5v1a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1c0-2.76-3.58-5-8-5Z"></path>
        </svg>
        <span>Profile</span>
      </button>
    </nav>
  `;
}

function renderThreadModal() {
  return `
    <div id="threadModalBackdrop" class="modal-backdrop" aria-hidden="true">
      <section class="thread-modal" role="dialog" aria-modal="true" aria-labelledby="threadModalTitle">
        <div class="modal-head">
          <div>
            <h2 id="threadModalTitle">Create thread</h2>
            <p>Write your next move. Add an image if it makes the post hit harder.</p>
          </div>

          <button id="modalCloseBtn" class="modal-close" type="button" aria-label="Close modal">
            ×
          </button>
        </div>

        <textarea
          id="modalThreadInput"
          class="modal-textarea"
          maxlength="280"
          placeholder="What's building in your mind today?"
        ></textarea>

        <div class="image-upload-box">
          <label class="image-upload-label" for="modalImageInput">
            <span class="image-upload-icon">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 20a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h14a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H5Zm0-2h14a1 1 0 0 0 1-1v-1.6l-3.7-3.7a1 1 0 0 0-1.4 0L12 14.6l-1.8-1.8a1 1 0 0 0-1.4 0L4 17.6A1 1 0 0 0 5 18Zm13-9.5A1.5 1.5 0 1 0 18 5a1.5 1.5 0 0 0 0 3.5Z"></path>
              </svg>
            </span>

            <span>
              <strong>Add image</strong>
              <small>JPG, PNG, WEBP or GIF · max 6MB</small>
            </span>
          </label>

          <input
            id="modalImageInput"
            class="image-upload-input"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
          />

          <div id="modalImagePreviewWrap" class="image-preview-wrap hidden">
            <img id="modalImagePreview" src="" alt="Selected image preview" />

            <div class="image-preview-meta">
              <strong id="modalImageName"></strong>
              <button id="modalRemoveImageBtn" class="mini-action delete-action" type="button">
                Remove image
              </button>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <span id="modalCharCount">0 / 280</span>
          <button id="modalUploadBtn" class="btn primary-btn" type="button">Upload</button>
        </div>
      </section>
    </div>
  `;
}

function mountSharedUI({ includeModal = false } = {}) {
  if (!document.getElementById("bottomHomeBtn")) {
    document.body.insertAdjacentHTML("beforeend", renderBottomNav());
  }

  if (includeModal && !document.getElementById("threadModalBackdrop")) {
    document.body.insertAdjacentHTML("beforeend", renderThreadModal());
    setupThreadModal();
  }

  setupBottomNav();
  setupSidebar();
}
