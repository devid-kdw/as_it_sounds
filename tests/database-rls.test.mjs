import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { createClient } from "@supabase/supabase-js";

const RUN_DB_TESTS = /^(1|true|yes)$/i.test(process.env.AIS_RUN_DB_TESTS ?? "");
const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";
const FREE_LAUNCH_SETTING_KEY = "free_launch_downloads_enabled";

if (!RUN_DB_TESTS) {
  test("database migration and RLS integration tests", {
    skip: "Set AIS_RUN_DB_TESTS=1 and run against local Supabase after migrations are applied.",
  }, () => {});
} else {
  test("database migration and RLS integration tests", async (t) => {
    const fixture = await createFixture();

    t.after(async () => {
      await fixture.cleanup();
    });

    await t.test("anonymous users can read published samples only", async () => {
      const { anon, samples } = fixture;
      const sampleIds = Object.values(samples.byStatus).map((sample) => sample.id);

      const result = await anon
        .from("samples")
        .select("id,status,poetic_name")
        .in("id", sampleIds)
        .order("status");

      assertNoError(result.error, "anonymous sample read");
      assert.deepEqual(
        result.data.map((sample) => sample.id).sort(),
        [samples.byStatus.published.id].sort(),
        "anonymous users must only see published samples",
      );
      assert.deepEqual(
        [...new Set(result.data.map((sample) => sample.status))],
        ["published"],
        "anonymous users must not see draft, processing, needs_review, failed, or archived samples",
      );
    });

    await t.test("authenticated users can manage only their own profile", async () => {
      const { admin, users } = fixture;

      const ownRead = await users.alpha.client
        .from("profiles")
        .select("id,email,display_name,role")
        .order("email");
      assertNoError(ownRead.error, "user profile read");
      assert.deepEqual(ownRead.data.map((profile) => profile.id), [users.alpha.id]);

      const ownUpdate = await users.alpha.client
        .from("profiles")
        .update({ display_name: "Alpha Listener" })
        .eq("id", users.alpha.id)
        .select("id,display_name,role")
        .single();
      assertNoError(ownUpdate.error, "user profile update");
      assert.equal(ownUpdate.data.display_name, "Alpha Listener");
      assert.equal(ownUpdate.data.role, "user");

      const otherUpdate = await users.alpha.client
        .from("profiles")
        .update({ display_name: "Not Allowed" })
        .eq("id", users.beta.id)
        .select("id");
      assertDeniedOrNoRows(otherUpdate, "users must not update another user's profile");

      const selfPromote = await users.alpha.client
        .from("profiles")
        .update({ role: "admin" })
        .eq("id", users.alpha.id)
        .select("id,role");
      assertDeniedOrNoRows(selfPromote, "normal users must not promote themselves to admin");

      const roleCheck = await admin
        .from("profiles")
        .select("role")
        .eq("id", users.alpha.id)
        .single();
      assertNoError(roleCheck.error, "post self-promotion role check");
      assert.equal(roleCheck.data.role, "user");
    });

    await t.test("authenticated users can favorite only their own published samples", async () => {
      const { samples, users } = fixture;

      const ownFavorite = await users.alpha.client
        .from("favorites")
        .insert({ user_id: users.alpha.id, sample_id: samples.byStatus.published.id })
        .select("user_id,sample_id")
        .single();
      assertNoError(ownFavorite.error, "own favorite insert");
      assert.deepEqual(ownFavorite.data, {
        user_id: users.alpha.id,
        sample_id: samples.byStatus.published.id,
      });

      const otherFavorite = await users.alpha.client
        .from("favorites")
        .insert({ user_id: users.beta.id, sample_id: samples.byStatus.published.id })
        .select("user_id,sample_id");
      assertDeniedOrNoRows(otherFavorite, "users must not create favorites for another user");

      const unpublishedFavorite = await users.alpha.client
        .from("favorites")
        .insert({ user_id: users.alpha.id, sample_id: samples.byStatus.draft.id })
        .select("user_id,sample_id");
      assertDeniedOrNoRows(unpublishedFavorite, "users must not favorite unpublished samples");

      const betaFavorite = await users.beta.client
        .from("favorites")
        .insert({ user_id: users.beta.id, sample_id: samples.byStatus.published.id })
        .select("user_id,sample_id")
        .single();
      assertNoError(betaFavorite.error, "beta favorite insert");

      const alphaRead = await users.alpha.client
        .from("favorites")
        .select("user_id,sample_id")
        .eq("sample_id", samples.byStatus.published.id);
      assertNoError(alphaRead.error, "own favorites read");
      assert.deepEqual(alphaRead.data.map((favorite) => favorite.user_id), [users.alpha.id]);

      const betaDelete = await users.alpha.client
        .from("favorites")
        .delete()
        .eq("user_id", users.beta.id)
        .eq("sample_id", samples.byStatus.published.id)
        .select("user_id");
      assertDeniedOrNoRows(betaDelete, "users must not delete another user's favorite");
    });

    await t.test("authenticated users can manage only their own collections and collection items", async () => {
      const { samples, users } = fixture;

      const alphaCollection = await users.alpha.client
        .from("collections")
        .insert({
          user_id: users.alpha.id,
          name: "Alpha Crate",
          description: "private test collection",
          visibility: "private",
        })
        .select("id,user_id,name,visibility")
        .single();
      assertNoError(alphaCollection.error, "own collection insert");
      assert.equal(alphaCollection.data.user_id, users.alpha.id);
      assert.equal(alphaCollection.data.visibility, "private");

      const betaCollection = await users.beta.client
        .from("collections")
        .insert({
          user_id: users.beta.id,
          name: "Beta Crate",
          visibility: "private",
        })
        .select("id,user_id")
        .single();
      assertNoError(betaCollection.error, "beta collection insert");

      const forgedCollection = await users.alpha.client
        .from("collections")
        .insert({ user_id: users.beta.id, name: "Forged Crate", visibility: "private" })
        .select("id,user_id");
      assertDeniedOrNoRows(forgedCollection, "users must not create collections for another user");

      const alphaCollections = await users.alpha.client
        .from("collections")
        .select("id,user_id")
        .order("created_at");
      assertNoError(alphaCollections.error, "own collections read");
      assert.ok(alphaCollections.data.some((collection) => collection.id === alphaCollection.data.id));
      assert.ok(!alphaCollections.data.some((collection) => collection.id === betaCollection.data.id));

      const alphaItem = await users.alpha.client
        .from("collection_items")
        .insert({
          collection_id: alphaCollection.data.id,
          sample_id: samples.byStatus.published.id,
          sort_order: 10,
        })
        .select("collection_id,sample_id,sort_order")
        .single();
      assertNoError(alphaItem.error, "own collection item insert");
      assert.equal(alphaItem.data.sort_order, 10);

      const betaItem = await users.beta.client
        .from("collection_items")
        .insert({
          collection_id: betaCollection.data.id,
          sample_id: samples.byStatus.published.id,
          sort_order: 20,
        })
        .select("collection_id,sample_id")
        .single();
      assertNoError(betaItem.error, "beta collection item insert");

      const forgedItem = await users.alpha.client
        .from("collection_items")
        .insert({
          collection_id: betaCollection.data.id,
          sample_id: samples.byStatus.published.id,
          sort_order: 30,
        })
        .select("collection_id,sample_id");
      assertDeniedOrNoRows(forgedItem, "users must not add items to another user's collection");

      const unpublishedItem = await users.alpha.client
        .from("collection_items")
        .insert({
          collection_id: alphaCollection.data.id,
          sample_id: samples.byStatus.draft.id,
          sort_order: 40,
        })
        .select("collection_id,sample_id");
      assertDeniedOrNoRows(unpublishedItem, "users must not add unpublished samples to collections");

      const betaItemsRead = await users.alpha.client
        .from("collection_items")
        .select("collection_id,sample_id")
        .eq("collection_id", betaCollection.data.id);
      assertDeniedOrNoRows(betaItemsRead, "users must not read another user's collection items");

      const updateOwnItem = await users.alpha.client
        .from("collection_items")
        .update({ sort_order: 11 })
        .eq("collection_id", alphaCollection.data.id)
        .eq("sample_id", samples.byStatus.published.id)
        .select("sort_order")
        .single();
      assertNoError(updateOwnItem.error, "own collection item update");
      assert.equal(updateOwnItem.data.sort_order, 11);

      const updateOtherItem = await users.alpha.client
        .from("collection_items")
        .update({ sort_order: 99 })
        .eq("collection_id", betaCollection.data.id)
        .eq("sample_id", samples.byStatus.published.id)
        .select("sort_order");
      assertDeniedOrNoRows(updateOtherItem, "users must not update another user's collection items");
    });

    await t.test("authenticated users can manage only their own recently played rows", async () => {
      const { samples, users } = fixture;

      const ownRecentlyPlayed = await users.alpha.client
        .from("recently_played")
        .insert({
          user_id: users.alpha.id,
          sample_id: samples.byStatus.published.id,
          source: "web",
        })
        .select("user_id,sample_id,source")
        .single();
      assertNoError(ownRecentlyPlayed.error, "own recently_played insert");
      assert.equal(ownRecentlyPlayed.data.user_id, users.alpha.id);

      const forgedRecentlyPlayed = await users.alpha.client
        .from("recently_played")
        .insert({
          user_id: users.beta.id,
          sample_id: samples.byStatus.published.id,
          source: "web",
        })
        .select("user_id,sample_id");
      assertDeniedOrNoRows(forgedRecentlyPlayed, "users must not create recently_played rows for another user");

      const unpublishedRecentlyPlayed = await users.alpha.client
        .from("recently_played")
        .insert({
          user_id: users.alpha.id,
          sample_id: samples.byStatus.draft.id,
          source: "web",
        })
        .select("user_id,sample_id");
      assertDeniedOrNoRows(unpublishedRecentlyPlayed, "users must not recently-play unpublished samples");

      const betaRecentlyPlayed = await users.beta.client
        .from("recently_played")
        .insert({
          user_id: users.beta.id,
          sample_id: samples.byStatus.published.id,
          source: "plugin",
        })
        .select("user_id,sample_id")
        .single();
      assertNoError(betaRecentlyPlayed.error, "beta recently_played insert");

      const alphaRead = await users.alpha.client
        .from("recently_played")
        .select("user_id,sample_id")
        .eq("sample_id", samples.byStatus.published.id);
      assertNoError(alphaRead.error, "own recently_played read");
      assert.deepEqual(alphaRead.data.map((row) => row.user_id), [users.alpha.id]);

      const updateOwn = await users.alpha.client
        .from("recently_played")
        .update({ source: "plugin" })
        .eq("user_id", users.alpha.id)
        .eq("sample_id", samples.byStatus.published.id)
        .select("source")
        .single();
      assertNoError(updateOwn.error, "own recently_played update");
      assert.equal(updateOwn.data.source, "plugin");

      const updateOther = await users.alpha.client
        .from("recently_played")
        .update({ source: "web" })
        .eq("user_id", users.beta.id)
        .eq("sample_id", samples.byStatus.published.id)
        .select("source");
      assertDeniedOrNoRows(updateOther, "users must not update another user's recently_played rows");
    });

    await t.test("non-admin users cannot read private asset/search infrastructure directly", async () => {
      const { anon, samples, users } = fixture;

      for (const [label, client] of [["anonymous", anon], ["authenticated", users.alpha.client]]) {
        const assets = await client
          .from("sample_assets")
          .select("kind,object_path")
          .eq("sample_id", samples.byStatus.published.id)
          .order("kind");
        assertNoError(assets.error, `${label} asset read`);
        assert.ok(
          assets.data.some((asset) => asset.kind === "preview_audio"),
          `${label} clients should be able to read preview assets for published samples`,
        );
        assert.ok(
          assets.data.some((asset) => asset.kind === "waveform_peaks"),
          `${label} clients should be able to read waveform assets for published samples`,
        );
        assert.ok(
          !assets.data.some((asset) => asset.kind === "original_wav"),
          `${label} clients must not read original_wav assets`,
        );

        const hiddenTags = await client
          .from("sample_hidden_tags")
          .select("sample_id,tag_slug")
          .eq("sample_id", samples.byStatus.published.id);
        assertDeniedOrNoRows(hiddenTags, `${label} clients must not read sample_hidden_tags directly`);

        const searchDocuments = await client
          .from("sample_search_documents")
          .select("sample_id,search_vector")
          .eq("sample_id", samples.byStatus.published.id);
        assertDeniedOrNoRows(searchDocuments, `${label} clients must not read sample_search_documents directly`);
      }
    });

    await t.test("admins can manage samples and admin-only rows", async () => {
      const { samples, tracked, users } = fixture;
      const adminClient = users.admin.client;
      const statusSamples = Object.values(samples.byStatus);

      const allStatusRead = await adminClient
        .from("samples")
        .select("id,status")
        .in("id", statusSamples.map((sample) => sample.id));
      assertNoError(allStatusRead.error, "admin sample lifecycle read");
      assert.deepEqual(
        allStatusRead.data.map((sample) => sample.id).sort(),
        statusSamples.map((sample) => sample.id).sort(),
        "admin users should read samples in every lifecycle state",
      );

      const adminInsertedSample = await adminClient
        .from("samples")
        .insert(makeSampleRow(fixture, {
          poetic_name: uniqueSlug(fixture, "admin_managed_sample"),
          display_title: "Admin Managed Sample",
          status: "draft",
        }))
        .select("id,status")
        .single();
      assertNoError(adminInsertedSample.error, "admin sample insert");
      tracked.sampleIds.add(adminInsertedSample.data.id);

      const adminUpdatedSample = await adminClient
        .from("samples")
        .update({ display_title: "Admin Updated Sample" })
        .eq("id", adminInsertedSample.data.id)
        .select("id,display_title")
        .single();
      assertNoError(adminUpdatedSample.error, "admin sample update");
      assert.equal(adminUpdatedSample.data.display_title, "Admin Updated Sample");

      const normalSampleInsert = await users.alpha.client
        .from("samples")
        .insert(makeSampleRow(fixture, {
          poetic_name: uniqueSlug(fixture, "normal_forbidden_sample"),
          display_title: "Normal Forbidden Sample",
          status: "draft",
        }))
        .select("id");
      trackSampleRowsIfPresent(tracked, normalSampleInsert);
      assertDeniedOrNoRows(normalSampleInsert, "normal users must not manage samples");

      const hiddenTagSlug = uniqueSlug(fixture, "admin_hidden_tag");
      const hiddenTag = await adminClient
        .from("hidden_tags")
        .insert({ slug: hiddenTagSlug, label: "Admin Hidden Tag", created_by: users.admin.id })
        .select("slug,label")
        .single();
      assertNoError(hiddenTag.error, "admin hidden tag insert");
      tracked.hiddenTagSlugs.add(hiddenTagSlug);

      const sampleHiddenTag = await adminClient
        .from("sample_hidden_tags")
        .insert({ sample_id: samples.byStatus.published.id, tag_slug: hiddenTagSlug })
        .select("sample_id,tag_slug")
        .single();
      assertNoError(sampleHiddenTag.error, "admin sample hidden tag insert");

      const searchDocumentUpdate = await adminClient
        .from("sample_search_documents")
        .update({ description_text: "admin adjusted search document" })
        .eq("sample_id", samples.byStatus.published.id)
        .select("sample_id,description_text")
        .single();
      assertNoError(searchDocumentUpdate.error, "admin search document update");
      assert.equal(searchDocumentUpdate.data.description_text, "admin adjusted search document");

      const normalHiddenTagSlug = uniqueSlug(fixture, "normal_hidden_tag");
      const normalHiddenTagInsert = await users.alpha.client
        .from("hidden_tags")
        .insert({ slug: normalHiddenTagSlug, label: "Normal Hidden Tag" })
        .select("slug");
      trackHiddenTagRowsIfPresent(tracked, normalHiddenTagInsert);
      assertDeniedOrNoRows(normalHiddenTagInsert, "normal users must not manage hidden tags");
    });

    await t.test("has_download_entitlement follows free launch, admin, subscription, and anonymous rules", async () => {
      const { admin, anon, users } = fixture;

      await setFreeLaunch(admin, false);
      await setSubscriptionStatus(admin, users.alpha.id, "free_launch_access");
      assert.equal(await hasDownloadEntitlement(users.alpha.client), false, "free_launch_access alone must not grant access");
      assert.equal(await hasDownloadEntitlement(anon), false, "anonymous users must not have download entitlement");

      await setFreeLaunch(admin, true);
      assert.equal(await hasDownloadEntitlement(users.alpha.client), true, "free launch enabled should grant authenticated access");
      assert.equal(await hasDownloadEntitlement(anon), false, "anonymous users must still not have download entitlement during free launch");

      await setFreeLaunch(admin, false);
      assert.equal(await hasDownloadEntitlement(users.admin.client), true, "admin users must have download entitlement");

      for (const status of ["trialing", "active", "lifetime_granted"]) {
        await setSubscriptionStatus(admin, users.alpha.id, status);
        assert.equal(await hasDownloadEntitlement(users.alpha.client), true, `${status} should grant download entitlement`);
      }

      for (const status of ["canceled", "unpaid"]) {
        await setSubscriptionStatus(admin, users.alpha.id, status);
        assert.equal(await hasDownloadEntitlement(users.alpha.client), false, `${status} should not grant download entitlement`);
      }
    });

    await t.test("duplicate Stripe event IDs are rejected", async () => {
      const { admin, tracked } = fixture;
      const stripeEventId = `evt_${fixture.prefix}_duplicate`;
      tracked.stripeEventIds.add(stripeEventId);

      const firstInsert = await admin
        .from("stripe_webhook_events")
        .insert({
          stripe_event_id: stripeEventId,
          event_type: "customer.subscription.updated",
          processing_status: "received",
          payload: { id: stripeEventId, object: "event" },
        })
        .select("stripe_event_id")
        .single();
      assertNoError(firstInsert.error, "first stripe webhook event insert");

      const duplicateInsert = await admin
        .from("stripe_webhook_events")
        .insert({
          stripe_event_id: stripeEventId,
          event_type: "customer.subscription.updated",
          processing_status: "received",
          payload: { id: stripeEventId, object: "event" },
        })
        .select("stripe_event_id");
      assert.ok(duplicateInsert.error, "duplicate Stripe event IDs must be rejected by the database");
      assert.equal(duplicateInsert.error.code, "23505");
    });

    await t.test("search documents refresh on sample identity, mood, hidden tag, and album changes", async () => {
      const { admin, tracked, users } = fixture;
      const sample = await insertSample(fixture, {
        poetic_name: uniqueSlug(fixture, "search_refresh_sample"),
        display_title: "Search Refresh Sample",
        short_description: "original search description",
        status: "draft",
      });

      let document = await getSearchDocument(admin, sample.id);
      assert.equal(document.poetic_name_text, sample.poetic_name);
      assert.equal(document.display_title_text, "Search Refresh Sample");

      const renamedPoeticName = uniqueSlug(fixture, "search_identity_updated");
      const identityUpdate = await admin
        .from("samples")
        .update({
          poetic_name: renamedPoeticName,
          display_title: "Search Identity Updated",
        })
        .eq("id", sample.id)
        .select("id")
        .single();
      assertNoError(identityUpdate.error, "sample identity update");

      document = await getSearchDocument(admin, sample.id);
      assert.equal(document.poetic_name_text, renamedPoeticName);
      assert.equal(document.display_title_text, "Search Identity Updated");

      const moodInsert = await admin
        .from("sample_moods")
        .insert({ sample_id: sample.id, mood_slug: "peaceful", sort_order: 1 })
        .select("sample_id,mood_slug")
        .single();
      assertNoError(moodInsert.error, "sample mood insert");

      document = await getSearchDocument(admin, sample.id);
      assert.match(document.mood_text, /peaceful/i);

      const hiddenTagSlug = uniqueSlug(fixture, "refresh_hidden_tag");
      const hiddenTag = await admin
        .from("hidden_tags")
        .insert({ slug: hiddenTagSlug, label: "Refresh Hidden Tag", created_by: users.admin.id })
        .select("slug")
        .single();
      assertNoError(hiddenTag.error, "hidden tag insert for search refresh");
      tracked.hiddenTagSlugs.add(hiddenTagSlug);

      const hiddenTagInsert = await admin
        .from("sample_hidden_tags")
        .insert({ sample_id: sample.id, tag_slug: hiddenTagSlug })
        .select("sample_id,tag_slug")
        .single();
      assertNoError(hiddenTagInsert.error, "sample hidden tag insert");

      document = await getSearchDocument(admin, sample.id);
      assert.match(document.hidden_tag_text, /refresh hidden tag|refresh_hidden_tag/i);

      const album = await admin
        .from("albums")
        .insert({
          slug: uniqueKebab(fixture, "search-refresh-album"),
          title: "Search Refresh Album",
          status: "published",
          created_by: users.admin.id,
          published_at: nowIso(),
        })
        .select("id,title")
        .single();
      assertNoError(album.error, "album insert for search refresh");
      tracked.albumIds.add(album.data.id);

      const albumMembership = await admin
        .from("album_samples")
        .insert({ album_id: album.data.id, sample_id: sample.id, sort_order: 1 })
        .select("album_id,sample_id")
        .single();
      assertNoError(albumMembership.error, "album sample insert");

      document = await getSearchDocument(admin, sample.id);
      assert.match(document.album_text, /search refresh album|search-refresh-album/i);
    });

    await t.test("publish constraints enforce license, loop BPM, melodic key confirmation, and mood limit", async () => {
      const invalidUnverified = await fixture.admin
        .from("samples")
        .insert(makeSampleRow(fixture, {
          poetic_name: uniqueSlug(fixture, "publish_unverified"),
          display_title: "Publish Unverified",
          status: "published",
          published_at: nowIso(),
          license_status: "unverified",
          license_confirmed_at: nowIso(),
          license_confirmed_by: fixture.users.admin.id,
        }))
        .select("id");
      trackSampleRowsIfPresent(fixture.tracked, invalidUnverified);
      assertWriteRejected(invalidUnverified, "published samples must have verified license_status");

      const invalidMissingConfirmation = await fixture.admin
        .from("samples")
        .insert(makeSampleRow(fixture, {
          poetic_name: uniqueSlug(fixture, "publish_unconfirmed"),
          display_title: "Publish Unconfirmed",
          status: "published",
          published_at: nowIso(),
          license_status: "verified",
          license_confirmed_at: null,
          license_confirmed_by: fixture.users.admin.id,
        }))
        .select("id");
      trackSampleRowsIfPresent(fixture.tracked, invalidMissingConfirmation);
      assertWriteRejected(invalidMissingConfirmation, "published samples must have license confirmation metadata");

      const invalidLoop = await fixture.admin
        .from("samples")
        .insert(makeSampleRow(fixture, {
          poetic_name: uniqueSlug(fixture, "publish_loop_without_bpm"),
          display_title: "Publish Loop Without BPM",
          sample_type_slug: "loop",
          category_slug: "loops",
          loopable: true,
          bpm: null,
          status: "published",
          published_at: nowIso(),
          license_status: "verified",
          license_confirmed_at: nowIso(),
          license_confirmed_by: fixture.users.admin.id,
        }))
        .select("id");
      trackSampleRowsIfPresent(fixture.tracked, invalidLoop);
      assertWriteRejected(invalidLoop, "loop samples must not publish without BPM");

      const invalidMelodic = await fixture.admin
        .from("samples")
        .insert(makeSampleRow(fixture, {
          poetic_name: uniqueSlug(fixture, "publish_melodic_unknown"),
          display_title: "Publish Melodic Unknown",
          is_melodic: true,
          musical_key: null,
          unknown_key_confirmed: false,
          status: "published",
          published_at: nowIso(),
          license_status: "verified",
          license_confirmed_at: nowIso(),
          license_confirmed_by: fixture.users.admin.id,
        }))
        .select("id");
      trackSampleRowsIfPresent(fixture.tracked, invalidMelodic);
      assertWriteRejected(invalidMelodic, "melodic samples must have a key or unknown-key confirmation");

      const validUnknownKey = await insertSample(fixture, {
        poetic_name: uniqueSlug(fixture, "publish_unknown_key_ok"),
        display_title: "Publish Unknown Key OK",
        is_melodic: true,
        musical_key: null,
        unknown_key_confirmed: true,
        status: "published",
      });
      assert.equal(validUnknownKey.status, "published");

      const moodLimitSample = await insertSample(fixture, {
        poetic_name: uniqueSlug(fixture, "mood_limit_sample"),
        display_title: "Mood Limit Sample",
        status: "draft",
      });
      const firstThreeMoods = await fixture.admin
        .from("sample_moods")
        .insert([
          { sample_id: moodLimitSample.id, mood_slug: "peaceful", sort_order: 1 },
          { sample_id: moodLimitSample.id, mood_slug: "warm", sort_order: 2 },
          { sample_id: moodLimitSample.id, mood_slug: "cold", sort_order: 3 },
        ])
        .select("mood_slug");
      assertNoError(firstThreeMoods.error, "first three mood inserts");
      assert.equal(firstThreeMoods.data.length, 3);

      const fourthMood = await fixture.admin
        .from("sample_moods")
        .insert({ sample_id: moodLimitSample.id, mood_slug: "dark", sort_order: 4 })
        .select("mood_slug");
      assertWriteRejected(fourthMood, "fourth mood insert must be rejected");
    });
  });
}

async function createFixture() {
  const statusEnv = readSupabaseStatusEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    ?? process.env.SUPABASE_URL
    ?? statusEnv.API_URL
    ?? statusEnv.SUPABASE_URL
    ?? LOCAL_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ?? process.env.SUPABASE_ANON_KEY
    ?? statusEnv.ANON_KEY
    ?? statusEnv.SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    ?? process.env.SUPABASE_SERVICE_KEY
    ?? statusEnv.SERVICE_ROLE_KEY
    ?? statusEnv.SUPABASE_SERVICE_ROLE_KEY;

  assert.ok(anonKey, "Missing Supabase anon key. Start local Supabase or set NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  assert.ok(serviceRoleKey, "Missing Supabase service role key. Start local Supabase or set SUPABASE_SERVICE_ROLE_KEY.");

  const admin = createSupabaseClient(url, serviceRoleKey);
  const anon = createSupabaseClient(url, anonKey);
  const prefix = `db_rls_${randomUUID().replaceAll("-", "").slice(0, 10)}`;
  const tracked = {
    albumIds: new Set(),
    collectionIds: new Set(),
    hiddenTagSlugs: new Set(),
    sampleIds: new Set(),
    stripeEventIds: new Set(),
    userIds: new Set(),
  };
  const fixture = {
    admin,
    anon,
    anonKey,
    prefix,
    tracked,
    url,
    users: {},
    samples: { byStatus: {} },
    originalFreeLaunchValue: null,
    cleanup: async () => cleanupFixture(fixture),
  };

  await assertSchemaReady(admin);
  fixture.originalFreeLaunchValue = await readFreeLaunchValue(admin);

  fixture.users.alpha = await createUserFixture(fixture, "alpha");
  fixture.users.beta = await createUserFixture(fixture, "beta");
  fixture.users.admin = await createUserFixture(fixture, "admin");

  const promoteAdmin = await admin
    .from("profiles")
    .update({ role: "admin" })
    .eq("id", fixture.users.admin.id)
    .select("id,role")
    .single();
  assertNoError(promoteAdmin.error, "admin profile promotion through service role");
  assert.equal(promoteAdmin.data.role, "admin");

  fixture.users.admin.client = await signInUser(fixture, fixture.users.admin.email, fixture.users.admin.password);

  fixture.samples.byStatus = await createLifecycleSamples(fixture);
  await createPublishedSampleAssets(fixture, fixture.samples.byStatus.published.id);
  await createPrivateSearchFixtures(fixture, fixture.samples.byStatus.published.id);

  return fixture;
}

function createSupabaseClient(url, key) {
  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

async function createUserFixture(fixture, label) {
  const email = `${fixture.prefix}.${label}@example.test`;
  const password = `Ais-${fixture.prefix}-${label}-12345`;
  const created = await fixture.admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: `${label} test user` },
  });

  assertNoError(created.error, `create auth user ${label}`);
  const id = created.data.user.id;
  fixture.tracked.userIds.add(id);

  await assertAuthMirrorRows(fixture.admin, id, email);

  return {
    client: await signInUser(fixture, email, password),
    email,
    id,
    password,
  };
}

async function signInUser(fixture, email, password) {
  const client = createSupabaseClient(fixture.url, fixture.anonKey);
  const signedIn = await client.auth.signInWithPassword({ email, password });
  assertNoError(signedIn.error, `sign in ${email}`);
  assert.ok(signedIn.data.session?.access_token, `expected signed-in session for ${email}`);
  return client;
}

async function assertAuthMirrorRows(admin, userId, email) {
  const profile = await admin
    .from("profiles")
    .select("id,email,role")
    .eq("id", userId)
    .single();
  assertNoError(profile.error, `profile mirror row for ${email}`);
  assert.equal(profile.data.email, email);
  assert.equal(profile.data.role, "user");

  const subscription = await admin
    .from("subscriptions")
    .select("user_id,status")
    .eq("user_id", userId)
    .single();
  assertNoError(subscription.error, `subscription mirror row for ${email}`);
  assert.equal(subscription.data.status, "free_launch_access");
}

async function assertSchemaReady(admin) {
  for (const { table, label } of [
    { table: "categories", label: "categories lookup table" },
    { table: "sample_types", label: "sample types lookup table" },
    { table: "moods", label: "moods lookup table" },
    { table: "samples", label: "samples table" },
    { table: "app_settings", label: "app settings table" },
  ]) {
    const result = await admin.from(table).select("*").limit(1);
    assertNoError(result.error, `${label} should exist; run Supabase migrations before DB tests`);
  }

  const categories = await admin.from("categories").select("slug").in("slug", ["textures", "loops"]);
  assertNoError(categories.error, "required category seeds");
  assert.deepEqual(
    categories.data.map((row) => row.slug).sort(),
    ["loops", "textures"],
    "required category seeds should exist",
  );

  const sampleTypes = await admin.from("sample_types").select("slug").in("slug", ["loop", "texture"]);
  assertNoError(sampleTypes.error, "required sample type seeds");
  assert.deepEqual(
    sampleTypes.data.map((row) => row.slug).sort(),
    ["loop", "texture"],
    "required sample type seeds should exist",
  );

  const moodCount = await admin.from("moods").select("slug", { count: "exact", head: true });
  assertNoError(moodCount.error, "mood seed count");
  assert.equal(moodCount.count, 15, "DISC-11 requires exactly 15 controlled primary moods");
}

async function readFreeLaunchValue(admin) {
  const setting = await admin
    .from("app_settings")
    .select("value")
    .eq("key", FREE_LAUNCH_SETTING_KEY)
    .single();
  assertNoError(setting.error, "free launch setting seed");
  return setting.data.value;
}

async function setFreeLaunch(admin, value) {
  const result = await admin
    .from("app_settings")
    .update({ value })
    .eq("key", FREE_LAUNCH_SETTING_KEY)
    .select("key,value")
    .single();
  assertNoError(result.error, `set ${FREE_LAUNCH_SETTING_KEY}=${value}`);
  assert.equal(result.data.value, value);
}

async function setSubscriptionStatus(admin, userId, status) {
  const result = await admin
    .from("subscriptions")
    .update({ status })
    .eq("user_id", userId)
    .select("user_id,status")
    .single();
  assertNoError(result.error, `set subscription status ${status}`);
  assert.equal(result.data.status, status);
}

async function hasDownloadEntitlement(client) {
  const result = await client.rpc("has_download_entitlement");
  assertNoError(result.error, "has_download_entitlement RPC");
  return result.data;
}

async function createLifecycleSamples(fixture) {
  const byStatus = {};

  for (const status of ["draft", "processing", "needs_review", "failed", "archived", "published"]) {
    byStatus[status] = await insertSample(fixture, {
      poetic_name: uniqueSlug(fixture, `sample_${status}`),
      display_title: `Sample ${status.replaceAll("_", " ")}`,
      status,
    });
  }

  return byStatus;
}

async function insertSample(fixture, overrides = {}) {
  const row = makeSampleRow(fixture, overrides);
  const result = await fixture.admin
    .from("samples")
    .insert(row)
    .select("id,poetic_name,display_title,status")
    .single();
  assertNoError(result.error, `insert sample ${row.poetic_name}`);
  fixture.tracked.sampleIds.add(result.data.id);
  return result.data;
}

function makeSampleRow(fixture, overrides = {}) {
  const status = overrides.status ?? "draft";
  const published = status === "published";
  const archived = status === "archived";
  const failed = status === "failed";

  return {
    poetic_name: uniqueSlug(fixture, "sample"),
    display_title: "Database Test Sample",
    category_slug: "textures",
    sample_type_slug: "texture",
    bpm: null,
    musical_key: null,
    is_melodic: false,
    unknown_key_confirmed: false,
    duration_seconds: 1.25,
    loopable: false,
    file_hash_sha256: `${fixture.prefix}_${randomUUID().replaceAll("-", "")}`,
    file_size_bytes: 1024,
    sample_rate: 48000,
    bit_depth: 24,
    channels: 2,
    status,
    license_status: published ? "verified" : "unverified",
    source_type: "original_recording",
    rights_owner: "AIS test fixture",
    commercial_use_allowed: true,
    redistribution_allowed: false,
    attribution_required: false,
    license_confirmed_at: published ? nowIso() : null,
    license_confirmed_by: published ? fixture.users.admin.id : null,
    featured: false,
    uploaded_by: fixture.users.admin.id,
    published_at: published ? nowIso() : null,
    archived_at: archived ? nowIso() : null,
    failed_at: failed ? nowIso() : null,
    ...overrides,
  };
}

async function createPublishedSampleAssets(fixture, sampleId) {
  const rows = [
    {
      sample_id: sampleId,
      kind: "original_wav",
      bucket: "samples-private",
      object_path: `${fixture.prefix}/original.wav`,
      mime_type: "audio/wav",
      file_size_bytes: 2048,
      access_level: "private",
    },
    {
      sample_id: sampleId,
      kind: "preview_audio",
      bucket: "samples-public",
      object_path: `${fixture.prefix}/preview.mp3`,
      mime_type: "audio/mpeg",
      file_size_bytes: 1024,
      access_level: "public",
    },
    {
      sample_id: sampleId,
      kind: "waveform_peaks",
      bucket: "samples-public",
      object_path: `${fixture.prefix}/waveform.json`,
      mime_type: "application/json",
      file_size_bytes: 512,
      access_level: "public",
    },
  ];

  const result = await fixture.admin.from("sample_assets").insert(rows).select("id,kind");
  assertNoError(result.error, "published sample asset fixtures");
  assert.equal(result.data.length, rows.length);
}

async function createPrivateSearchFixtures(fixture, sampleId) {
  const tagSlug = uniqueSlug(fixture, "private_hidden_tag");
  const hiddenTag = await fixture.admin
    .from("hidden_tags")
    .insert({ slug: tagSlug, label: "Private Hidden Tag", created_by: fixture.users.admin.id })
    .select("slug")
    .single();
  assertNoError(hiddenTag.error, "private hidden tag fixture");
  fixture.tracked.hiddenTagSlugs.add(tagSlug);

  const sampleHiddenTag = await fixture.admin
    .from("sample_hidden_tags")
    .insert({ sample_id: sampleId, tag_slug: tagSlug })
    .select("sample_id,tag_slug")
    .single();
  assertNoError(sampleHiddenTag.error, "sample hidden tag fixture");

  await getSearchDocument(fixture.admin, sampleId);
}

async function getSearchDocument(admin, sampleId) {
  const result = await admin
    .from("sample_search_documents")
    .select("sample_id,poetic_name_text,display_title_text,description_text,mood_text,hidden_tag_text,album_text,search_vector")
    .eq("sample_id", sampleId)
    .single();
  assertNoError(result.error, `search document for sample ${sampleId}`);
  return result.data;
}

async function cleanupFixture(fixture) {
  await maybeSetFreeLaunch(fixture.admin, fixture.originalFreeLaunchValue);

  await deleteWhereIn(fixture.admin, "stripe_webhook_events", "stripe_event_id", fixture.tracked.stripeEventIds);
  await deleteWhereIn(fixture.admin, "collection_items", "collection_id", fixture.tracked.collectionIds);
  await deleteWhereIn(fixture.admin, "collections", "id", fixture.tracked.collectionIds);
  await deleteWhereIn(fixture.admin, "recently_played", "user_id", fixture.tracked.userIds);
  await deleteWhereIn(fixture.admin, "favorites", "user_id", fixture.tracked.userIds);
  await deleteWhereIn(fixture.admin, "album_samples", "album_id", fixture.tracked.albumIds);
  await deleteWhereIn(fixture.admin, "sample_hidden_tags", "sample_id", fixture.tracked.sampleIds);
  await deleteWhereIn(fixture.admin, "sample_moods", "sample_id", fixture.tracked.sampleIds);
  await deleteWhereIn(fixture.admin, "sample_assets", "sample_id", fixture.tracked.sampleIds);
  await deleteWhereIn(fixture.admin, "sample_search_documents", "sample_id", fixture.tracked.sampleIds);
  await deleteWhereIn(fixture.admin, "sample_stats", "sample_id", fixture.tracked.sampleIds);
  await deleteWhereIn(fixture.admin, "albums", "id", fixture.tracked.albumIds);
  await deleteWhereIn(fixture.admin, "samples", "id", fixture.tracked.sampleIds);
  await deleteWhereIn(fixture.admin, "hidden_tags", "slug", fixture.tracked.hiddenTagSlugs);

  for (const userId of fixture.tracked.userIds) {
    await fixture.admin.auth.admin.deleteUser(userId);
  }
}

async function maybeSetFreeLaunch(admin, value) {
  if (value === null || value === undefined) {
    return;
  }

  await admin
    .from("app_settings")
    .update({ value })
    .eq("key", FREE_LAUNCH_SETTING_KEY);
}

async function deleteWhereIn(admin, table, column, values) {
  const valueList = [...values];

  if (valueList.length === 0) {
    return;
  }

  await admin.from(table).delete().in(column, valueList);
}

function readSupabaseStatusEnv() {
  try {
    const output = execFileSync("supabase", ["status", "-o", "env"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return Object.fromEntries(
      output
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && line.includes("="))
        .map((line) => {
          const [key, ...rest] = line.split("=");
          return [key, rest.join("=").replace(/^["']|["']$/g, "")];
        }),
    );
  } catch {
    return {};
  }
}

function assertNoError(error, context) {
  if (error) {
    assert.fail(`${context}: ${error.message} (${error.code ?? "no_code"})`);
  }
}

function assertDeniedOrNoRows(result, context) {
  if (result.error) {
    assert.match(
      result.error.message,
      /permission denied|row-level security|violates row-level security|not authorized|duplicate key|violates/i,
      `${context}: unexpected error ${result.error.message}`,
    );
    return;
  }

  if (Array.isArray(result.data)) {
    assert.equal(result.data.length, 0, context);
    return;
  }

  assert.equal(result.data, null, context);
}

function assertWriteRejected(result, context) {
  assert.ok(result.error, context);
  assert.match(
    result.error.message,
    /violates|row-level security|permission denied|check constraint|duplicate key|may not have more than 3 mood tags/i,
    `${context}: unexpected error ${result.error.message}`,
  );
}

function trackSampleRowsIfPresent(tracked, result) {
  for (const row of result.data ?? []) {
    if (row.id) {
      tracked.sampleIds.add(row.id);
    }
  }
}

function trackHiddenTagRowsIfPresent(tracked, result) {
  for (const row of result.data ?? []) {
    if (row.slug) {
      tracked.hiddenTagSlugs.add(row.slug);
    }
  }
}

function uniqueSlug(fixture, stem) {
  return `${fixture.prefix}_${stem}_${randomUUID().replaceAll("-", "").slice(0, 8)}`
    .toLowerCase()
    .replaceAll(/[^a-z0-9_]/g, "_");
}

function uniqueKebab(fixture, stem) {
  return `${fixture.prefix}-${stem}-${randomUUID().replaceAll("-", "").slice(0, 8)}`
    .toLowerCase()
    .replaceAll(/[^a-z0-9-]/g, "-");
}

function nowIso() {
  return new Date().toISOString();
}
