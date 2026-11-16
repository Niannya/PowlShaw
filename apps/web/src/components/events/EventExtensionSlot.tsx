"use client";

import { getExtensionDefinition } from "@/lib/extensions/definitions";
import { extensionRegistry } from "@/lib/extensions/registry";
import type { PublicEventExtension } from "@/lib/extensions/types";

/**
 * 活动页扩展插槽：按 `sort_order` 顺序渲染已注册模块。
 *
 * 安全降级：未注册的 `kind`、版本不匹配、配置结构不兼容时静默跳过，
 * 绝不因为某届活动的数据问题让整页白屏。
 */
export function EventExtensionSlot({ extensions }: { extensions?: PublicEventExtension[] }) {
  if (!extensions?.length) return null;

  return (
    <>
      {extensions.map((extension) => {
        const definition = getExtensionDefinition(extension.kind);
        if (!definition) return null;
        if (Number(extension.version) !== definition.version) return null;

        const parsed = definition.configSchema.safeParse(extension.config);
        if (!parsed.success) return null;

        const registered = extensionRegistry[extension.kind];
        if (!registered) return null;

        const View = registered.render;
        return (
          <section
            className="panel event-extension-panel"
            data-extension={extension.kind}
            key={`${extension.kind}-${extension.eventId}`}
          >
            <h2 className="panel-title blue">{definition.title}</h2>
            <div className="panel-body event-extension-body">
              <View
                config={parsed.data}
                items={extension.items}
                eventId={extension.eventId}
                canSubmit={Boolean(extension.canSubmit)}
              />
            </div>
          </section>
        );
      })}
    </>
  );
}
