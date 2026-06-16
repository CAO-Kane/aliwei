export const ASK_USER_TOOL = {
  ask_user: {
    description:
      "向用户提出一个 2-4 个选项的单选问题,把决定权交还给用户。适合:确认偏好、分支选择、消除歧义。不要用于开放式提问(直接用普通对话)。",
    parameters: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "要问用户的问题",
        },
        options: {
          type: "array",
          minItems: 2,
          maxItems: 4,
          items: { type: "string" },
          description: "2-4 个候选选项",
        },
      },
      required: ["question", "options"],
      additionalProperties: false,
    },
  },
} as const;
