
// BotaniIQ responsive navigation
document.addEventListener("DOMContentLoaded", () => {
    const menuToggle = document.getElementById("menu-toggle");
    const navigation = document.getElementById("site-navigation");

    if (!menuToggle || !navigation) return;

    function closeMenu() {
        navigation.classList.remove("is-open");
        menuToggle.classList.remove("is-active");
        menuToggle.setAttribute("aria-expanded", "false");
        menuToggle.setAttribute("aria-label", "Open navigation menu");
    }

    function toggleMenu() {
        const isOpen = navigation.classList.toggle("is-open");

        menuToggle.classList.toggle("is-active", isOpen);
        menuToggle.setAttribute("aria-expanded", String(isOpen));
        menuToggle.setAttribute(
            "aria-label",
            isOpen ? "Close navigation menu" : "Open navigation menu"
        );
    }

    menuToggle.addEventListener("click", toggleMenu);

    // Close the menu after choosing a navigation link.
    navigation.querySelectorAll("a").forEach((link) => {
        link.addEventListener("click", closeMenu);
    });

    // Close the menu when Escape is pressed.
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closeMenu();
            menuToggle.focus();
        }
    });

    // Close the mobile menu when returning to desktop width.
    window.matchMedia("(min-width: 769px)").addEventListener("change", (event) => {
        if (event.matches) {
            closeMenu();
        }
    });
});
