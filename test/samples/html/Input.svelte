<script lang="ts">
let a = '';
$: animationAction = { duration: 100 };
</script>
2
<svelte:head>
  <div>head</div>
</svelte:head>
3
<h1 data-error-out on:click let:a={{b}} transition:a></h1>
{#if 0}
  <div>0</div>
{/if}
{#each [] as a, i (a.id)}
  <div animate:a={animationAction}>each</div>
  {/each}
4
<style>
  @import "~eslint-plugin-svelte3";
</style>
5

{#await 0}
  <div>pending</div>
  {:then a}
  <div>then</div>
  {:catch e}
  <div>catch</div>
  {/await}
<svelte:component this={0}>
  <div>component</div>
</svelte:component>
{#if 0}
<svelte:self>
  <div>self</div>
</svelte:self>
  {:else}<div>else</div>
  {/if}
{a}
<!--

comment

-->

6
<script context="module">

</script>
7
<svelte:options>
  <div>options</div>
</svelte:options>

8
<input {...a}
       type="checkbox"
     use:a={focus && a === 0}
     focus={focus && a === 0}
     bind:group={a} />
{#if 1}
  <div class="radioMore">
    {#if 1 === 'individual'}
      <div class="selected creation-individual">
        {#if 1 && 1}
          <div class="access-token"></div>
        {:else}
          {#if 1}
          <p>You haven't connected any accounts yet.</p>
            {/if}
        {/if}
      </div>
    {:else if '' === 'shared'}
      <p class="selected creation-shared">
        ​​If
      </p>
    {/if}
  </div>
{/if}