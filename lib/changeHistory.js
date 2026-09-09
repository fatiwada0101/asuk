import { supabaseAdmin } from './supabase-server.js';
import { 
  getWalledGardenEntries, 
  addWalledGardenEntry, 
  removeWalledGardenEntry,
  pushHotspotLoginPageToRouter,
  sanitizeMikroTikConfig
} from './mikrotik.js';

/**
 * Log an administrative configuration change to the change_history table.
 * 
 * @param {object} params
 * @param {'walled-garden'|'login-design'|'mikrotik-config'|'branding'|'payment-gateway'} params.category
 * @param {'add'|'remove'|'update'|'push'|'bulk-add'|'auto-setup'|'rollback'} params.action
 * @param {string} params.summary - Human-readable summary
 * @param {object} [params.beforeState] - Snapshot before change
 * @param {object} [params.afterState] - Snapshot after change
 * @param {object} [params.metadata] - Extra context (domains, template name, etc.)
 * @returns {Promise<{success: boolean, id?: string, error?: string}>}
 */
export async function logChange({
  category,
  action,
  summary,
  beforeState = {},
  afterState = {},
  metadata = {},
}) {
  try {
    if (!category || !action || !summary) {
      console.warn('logChange: Missing required parameters', { category, action, summary });
      return { success: false, error: 'Missing required parameters' };
    }

    const { data, error } = await supabaseAdmin
      .from('change_history')
      .insert({
        category,
        action,
        summary,
        before_state: beforeState || {},
        after_state: afterState || {},
        metadata: metadata || {},
        rolled_back: false,
        created_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) {
      console.error('Failed to insert change_history:', error.message);
      return { success: false, error: error.message };
    }

    return { success: true, id: data?.id };
  } catch (err) {
    console.error('logChange unexpected error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Fetch change history entries with pagination and category filtering.
 */
export async function getChangeHistory({ category, limit = 50, offset = 0 } = {}) {
  try {
    let query = supabaseAdmin
      .from('change_history')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (category && category !== 'all') {
      query = query.eq('category', category);
    }

    const { data, error } = await query;
    if (error) throw error;

    return { success: true, entries: data || [] };
  } catch (err) {
    console.error('getChangeHistory error:', err.message);
    return { success: false, error: err.message, entries: [] };
  }
}

/**
 * Rollback a specific change by ID, reverting settings and router configurations.
 * 
 * @param {string} changeId
 * @returns {Promise<{success: boolean, message?: string, error?: string}>}
 */
export async function rollbackChange(changeId) {
  try {
    if (!changeId) {
      return { success: false, error: 'Change ID is required' };
    }

    // Fetch the target change entry
    const { data: entry, error: fetchErr } = await supabaseAdmin
      .from('change_history')
      .select('*')
      .eq('id', changeId)
      .single();

    if (fetchErr || !entry) {
      return { success: false, error: 'Change history record not found' };
    }

    if (entry.rolled_back) {
      return { success: false, error: 'This change has already been rolled back' };
    }

    const { category, action, before_state: beforeState, after_state: afterState, metadata } = entry;

    let rollbackDetails = '';

    // Category-specific rollback logic
    switch (category) {
      case 'mikrotik-config': {
        if (!beforeState || Object.keys(beforeState).length === 0) {
          return { success: false, error: 'No previous MikroTik configuration saved to restore' };
        }
        const finalVal = sanitizeMikroTikConfig(beforeState);
        const { error: setErr } = await supabaseAdmin
          .from('app_settings')
          .upsert({
            key: 'mikrotik',
            value: finalVal,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'key' });

        if (setErr) throw setErr;
        rollbackDetails = 'Restored previous MikroTik router settings';
        break;
      }

      case 'branding': {
        if (!beforeState || Object.keys(beforeState).length === 0) {
          return { success: false, error: 'No previous branding configuration saved to restore' };
        }
        const { error: setErr } = await supabaseAdmin
          .from('app_settings')
          .upsert({
            key: 'branding',
            value: beforeState,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'key' });

        if (setErr) throw setErr;
        rollbackDetails = 'Restored previous branding settings';
        break;
      }

      case 'payment-gateway': {
        if (!beforeState || Object.keys(beforeState).length === 0) {
          return { success: false, error: 'No previous payment gateway configuration saved to restore' };
        }
        const { error: setErr } = await supabaseAdmin
          .from('app_settings')
          .upsert({
            key: 'flutterwave',
            value: beforeState,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'key' });

        if (setErr) throw setErr;
        rollbackDetails = 'Restored previous payment gateway keys and configuration';
        break;
      }

      case 'login-design': {
        if (!beforeState || Object.keys(beforeState).length === 0) {
          return { success: false, error: 'No previous login portal template saved to restore' };
        }
        // 1. Update app_settings
        const { error: setErr } = await supabaseAdmin
          .from('app_settings')
          .upsert({
            key: 'portal_template',
            value: beforeState,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'key' });

        if (setErr) throw setErr;

        // 2. Re-push the restored template to router storage
        try {
          await pushHotspotLoginPageToRouter({
            templateId: beforeState.templateId || 'midnight-glass',
            wifiSsid: beforeState.wifiSsid,
            businessName: beforeState.businessName,
            logoUrl: beforeState.logoUrl,
            contactFooter: beforeState.contactFooter,
            primaryColor: beforeState.primaryColor,
            buyUrl: beforeState.buyUrl,
          });
          rollbackDetails = 'Restored previous login template and pushed live to router';
        } catch (routerErr) {
          rollbackDetails = `Restored database settings, but failed to push to router: ${routerErr.message}`;
        }
        break;
      }

      case 'walled-garden': {
        try {
          if (action === 'add') {
            const targetHost = metadata?.dst_host || afterState?.dst_host || beforeState?.dst_host;
            if (!targetHost) {
              return { success: false, error: 'No target domain identified for walled garden rollback' };
            }
            // Find matching entries on router and remove
            const entries = await getWalledGardenEntries();
            const cleanTarget = String(targetHost).trim().toLowerCase();
            const matches = entries.filter(e => (e['dst-host'] || '').trim().toLowerCase() === cleanTarget);

            for (const match of matches) {
              if (match['.id']) {
                await removeWalledGardenEntry(match['.id'], match._source);
              }
            }
            rollbackDetails = `Removed ${targetHost} from router walled garden`;
          } else if (action === 'remove') {
            const targetHost = metadata?.dst_host || beforeState?.dst_host;
            if (!targetHost) {
              return { success: false, error: 'No previous domain identified to re-add to walled garden' };
            }
            await addWalledGardenEntry({
              dstHost: targetHost,
              comment: beforeState?.comment || metadata?.comment || 'Restored via rollback',
            });
            rollbackDetails = `Re-added ${targetHost} to router walled garden`;
          } else if (action === 'bulk-add') {
            const domains = metadata?.domains || [];
            if (!Array.isArray(domains) || domains.length === 0) {
              return { success: false, error: 'No domain list found to rollback bulk add' };
            }
            const entries = await getWalledGardenEntries();
            let removedCount = 0;
            for (const domain of domains) {
              const clean = String(domain).trim().toLowerCase();
              const matches = entries.filter(e => (e['dst-host'] || '').trim().toLowerCase() === clean);
              for (const match of matches) {
                if (match['.id']) {
                  try {
                    await removeWalledGardenEntry(match['.id'], match._source);
                    removedCount++;
                  } catch {}
                }
              }
            }
            rollbackDetails = `Removed ${removedCount} bulk domain(s) from router walled garden`;
          } else {
            return { success: false, error: `Rollback not supported for walled garden action: ${action}` };
          }
        } catch (routerErr) {
          return { success: false, error: `Router communication failed during rollback: ${routerErr.message}` };
        }
        break;
      }

      default:
        return { success: false, error: `Unknown category: ${category}` };
    }

    // Mark original entry as rolled_back
    await supabaseAdmin
      .from('change_history')
      .update({ rolled_back: true })
      .eq('id', changeId);

    // Record the rollback as a new change entry
    await logChange({
      category,
      action: 'rollback',
      summary: `Rolled back: ${entry.summary}`,
      beforeState: afterState,
      afterState: beforeState,
      metadata: { original_change_id: changeId, rollbackDetails },
    });

    return {
      success: true,
      message: rollbackDetails || `Successfully rolled back "${entry.summary}"`,
    };
  } catch (err) {
    console.error('rollbackChange error:', err);
    return { success: false, error: err.message };
  }
}
