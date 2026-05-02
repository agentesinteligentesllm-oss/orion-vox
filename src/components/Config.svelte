<script lang="ts">
import { router } from '../lib/router.svelte.ts';
import LoginWizard from './LoginWizard.svelte';
import Settings from './Settings.svelte';
</script>

{#if router.firstTime}
  <LoginWizard />
{:else}
  <Settings />
{/if}
