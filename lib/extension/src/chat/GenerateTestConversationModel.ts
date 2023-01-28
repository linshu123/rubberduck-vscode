import * as vscode from "vscode";
import { OpenAIClient } from "../openai/OpenAIClient";
import { ConversationModel } from "./ConversationModel";
import { generateGenerateTestCompletion } from "./generateGenerateTestCompletion";
import { generateRefineCodeCompletion } from "./generateRefineCodeCompletion";

export class GenerateTestConversationModel extends ConversationModel {
  readonly filename: string;
  readonly range: vscode.Range;
  readonly selectedText: string;
  readonly language: string | undefined;

  testContent: string | undefined;
  testDocument: vscode.TextDocument | undefined;
  testEditor: vscode.TextEditor | undefined;

  constructor(
    {
      id,
      filename,
      range,
      selectedText,
      language,
    }: {
      id: string;
      filename: string;
      range: vscode.Range;
      selectedText: string;
      language: string | undefined;
    },
    { openAIClient }: { openAIClient: OpenAIClient }
  ) {
    super({
      id,
      openAIClient,
      initialState: {
        type: "waitingForBotAnswer",
        botAction: "Generating test",
      },
    });

    this.filename = filename;
    this.range = range;
    this.selectedText = selectedText;
    this.language = language;
  }

  getTrigger() {
    return {
      type: "generateTest",
      selection: {
        filename: this.filename,
        startLine: this.range.start.line,
        endLine: this.range.end.line,
        text: this.selectedText,
      },
    } as const;
  }

  async updateEditor() {
    const testContent = this.testContent;

    if (testContent == undefined) {
      return;
    }

    // introduce local variable to ensure that testDocument is defined:
    const testDocument =
      this.testDocument ??
      (await vscode.workspace.openTextDocument({
        language: this.language,
        content: testContent,
      }));

    this.testDocument = testDocument;

    if (this.testEditor == undefined) {
      this.testEditor = await vscode.window.showTextDocument(
        testDocument,
        vscode.ViewColumn.Beside
      );
    } else {
      this.testEditor.edit((edit: vscode.TextEditorEdit) => {
        edit.replace(
          new vscode.Range(
            testDocument.positionAt(0),
            testDocument.positionAt(testDocument.getText().length - 1)
          ),
          testContent
        );
      });
    }
  }

  async answer() {
    if (this.state.type !== "waitingForBotAnswer") {
      return;
    }

    const userMessages = this.messages.filter(
      (message) => message.author === "user"
    );

    const testContent =
      userMessages.length > 0 && this.testContent != null
        ? await generateRefineCodeCompletion({
            code: this.testContent,
            instruction: userMessages[userMessages.length - 1].content,
            openAIClient: this.openAIClient,
          })
        : await generateGenerateTestCompletion({
            selectedText: this.selectedText,
            openAIClient: this.openAIClient,
          });

    this.testContent = testContent;

    this.addBotMessage({
      content: "Test generated.",
      responsePlaceholder: "Instruct how to refine the test…",
    });
  }
}
