document.addEventListener("DOMContentLoaded", () => {
    const toggleButton = document.getElementById("dark-mode-toggle");
    const body = document.body;
  
    if (localStorage.getItem("dark-mode") === "enabled") {
      body.classList.add("dark-mode");
      console.log("Dark mode enabled from localStorage");
    }
  
    toggleButton.addEventListener("click", () => {
      body.classList.toggle("dark-mode");
      if (body.classList.contains("dark-mode")) {
        localStorage.setItem("dark-mode", "enabled");
      } else {
        localStorage.setItem("dark-mode", "disabled");
      }
    });
  });
  