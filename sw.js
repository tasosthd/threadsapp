<script>
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker
        .register("/sw.js")
        .then(function () {
          console.log("Loomyva service worker registered");
        })
        .catch(function (error) {
          console.error("Service worker registration failed:", error);
        });
    });
  }
</script>
