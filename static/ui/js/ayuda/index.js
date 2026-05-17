(function () {
    const content = document.querySelector(".help-content")
    const nav = document.querySelector(".help-nav")
    const links = Array.from(document.querySelectorAll(".help-nav a[href^='#']"))
    if (!content || !nav || links.length === 0) return

    const searchInput = document.getElementById("helpSearchInput")
    const searchClear = document.getElementById("helpSearchClear")
    const searchMeta = document.getElementById("helpSearchMeta")
    const searchBox = document.getElementById("inicio-rapido")
    const cards = Array.from(document.querySelectorAll(".help-card"))
    const byId = new Map(links.map(link => [link.getAttribute("href").slice(1), link]))

    const empty = document.createElement("div")
    empty.className = "help-empty is-hidden"
    empty.textContent = "No hay resultados para esa búsqueda."
    searchBox?.insertAdjacentElement("afterend", empty)

    const targets = Array.from(byId.keys())
        .map(id => document.getElementById(id))
        .filter(Boolean)

    let activeId = ""
    let activeFrame = 0
    let clickScrollTimer = null

    function normalize(value) {
        return (value || "")
            .toString()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .trim()
    }

    function isHidden(element) {
        return element.classList.contains("is-hidden") || Boolean(element.closest(".help-card.is-hidden"))
    }

    function getCardSections(card) {
        return Array.from(card.querySelectorAll("section, .help-tips > div"))
    }

    function keepLinkInView(link) {
        const margin = 18
        const navRect = nav.getBoundingClientRect()
        const linkRect = link.getBoundingClientRect()
        const maxScroll = nav.scrollHeight - nav.clientHeight
        const topDelta = linkRect.top - navRect.top - margin
        const bottomDelta = linkRect.bottom - navRect.bottom + margin

        if (topDelta < 0) {
            nav.scrollTop = Math.max(0, nav.scrollTop + topDelta)
        } else if (bottomDelta > 0) {
            nav.scrollTop = Math.min(maxScroll, nav.scrollTop + bottomDelta)
        }
    }

    function setActive(id, scrollNav = true) {
        const activeLink = byId.get(id)
        if (!activeLink || activeLink.classList.contains("is-hidden")) return

        activeId = id
        links.forEach(link => {
            link.classList.toggle("is-active", link === activeLink)
        })

        if (scrollNav) keepLinkInView(activeLink)
    }

    function getVisibleTargets() {
        return targets
            .filter(target => target.id && byId.has(target.id) && !isHidden(target))
            .sort((a, b) => a.offsetTop - b.offsetTop)
    }

    function getActiveIdFromScroll() {
        const visibleTargets = getVisibleTargets()
        if (visibleTargets.length === 0) return ""

        const contentRect = content.getBoundingClientRect()
        const marker = contentRect.top + Math.min(140, content.clientHeight * 0.3)
        const bottomReached = content.scrollTop + content.clientHeight >= content.scrollHeight - 6
        let current = visibleTargets[0]

        if (bottomReached) return visibleTargets[visibleTargets.length - 1].id

        visibleTargets.forEach(target => {
            const rect = target.getBoundingClientRect()
            const hasReachedMarker = rect.top <= marker
            const isStillRelevant = rect.bottom > contentRect.top + 12

            if (hasReachedMarker && isStillRelevant) {
                current = target
            }
        })

        return current.id
    }

    function updateActiveFromScroll() {
        activeFrame = 0
        const nextId = getActiveIdFromScroll()
        if (nextId && nextId !== activeId) setActive(nextId)
    }

    function requestActiveUpdate() {
        if (activeFrame) return
        activeFrame = window.requestAnimationFrame(updateActiveFromScroll)
    }

    function syncNav(visibleIds) {
        links.forEach(link => {
            const id = link.getAttribute("href").slice(1)
            link.classList.toggle("is-hidden", !visibleIds.has(id))
        })
    }

    function filterHelp() {
        const query = normalize(searchInput?.value)
        const visibleIds = new Set(["inicio-rapido"])
        let resultCount = 0

        if (!query) {
            cards.forEach(card => {
                card.classList.remove("is-hidden")
                if (card.id) visibleIds.add(card.id)

                getCardSections(card).forEach(section => {
                    section.classList.remove("is-hidden")
                    if (section.id) visibleIds.add(section.id)
                })
            })

            empty.classList.add("is-hidden")
            if (searchMeta) searchMeta.textContent = ""
            if (searchClear) searchClear.hidden = true
            syncNav(visibleIds)
            requestActiveUpdate()
            return
        }

        cards.forEach(card => {
            const headerText = normalize(card.querySelector("header")?.textContent)
            const cardMatches = headerText.includes(query)
            const sections = getCardSections(card)
            let cardVisible = cardMatches

            sections.forEach(section => {
                const sectionMatches = cardMatches || normalize(section.textContent).includes(query)
                section.classList.toggle("is-hidden", !sectionMatches)

                if (sectionMatches) {
                    cardVisible = true
                    resultCount += 1
                    if (section.id) visibleIds.add(section.id)
                }
            })

            card.classList.toggle("is-hidden", !cardVisible)

            if (cardVisible && card.id) {
                visibleIds.add(card.id)
            }
        })

        empty.classList.toggle("is-hidden", resultCount > 0)
        if (searchMeta) searchMeta.textContent = resultCount === 1 ? "1 resultado" : `${resultCount} resultados`
        if (searchClear) searchClear.hidden = false
        syncNav(visibleIds)
        requestActiveUpdate()
    }

    links.forEach(link => {
        link.addEventListener("click", event => {
            if (link.classList.contains("is-hidden")) return

            const id = link.getAttribute("href").slice(1)
            const target = document.getElementById(id)
            if (!target) return

            event.preventDefault()
            target.scrollIntoView({ behavior: "smooth", block: "start" })
            history.replaceState(null, "", `#${id}`)
            setActive(id)

            window.clearTimeout(clickScrollTimer)
            clickScrollTimer = window.setTimeout(requestActiveUpdate, 450)
        })
    })

    content.addEventListener("scroll", requestActiveUpdate, { passive: true })

    searchInput?.addEventListener("input", filterHelp)
    searchClear?.addEventListener("click", () => {
        searchInput.value = ""
        filterHelp()
        searchInput.focus()
    })

    const initialId = window.location.hash ? window.location.hash.slice(1) : "inicio-rapido"
    if (byId.has(initialId)) setActive(initialId)

    filterHelp()
    requestActiveUpdate()
})()
