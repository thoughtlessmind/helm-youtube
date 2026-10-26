<script lang="ts">
  let { size = 22 }: { size?: number } = $props();
</script>

<!-- branding/icon.svg's H▶, on the accent. -->
<svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
  <rect class="bg" x="1" y="1" width="22" height="22" rx="6"></rect>
  <g class="fg">
    <rect x="4.44" y="5.58" width="3.2" height="12.84"></rect>
    <rect x="11.08" y="5.58" width="3.2" height="12.84"></rect>
    <rect x="4.44" y="10.4" width="11" height="3.2"></rect>
    <path d="M15.44 7.88L20.25 12L15.44 16.12Z"></path>
  </g>
</svg>

<style>
  svg {
    flex-shrink: 0;
  }
  .bg {
    fill: var(--accent);
  }
  .fg {
    fill: var(--on-accent);
  }
</style>
