import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  ViewEncapsulation,
  inject,
} from '@angular/core';
import {
  FormControl,
  FormGroup,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import {
  AppConfig,
  ChatUi,
  FEATURE_CHAT_DOM_IDS,
  UI_TEXT,
} from '@poalim/constants';
import {
  ChatMessage,
  EditSubmitEvent,
  FeatureChatComposerFormValue,
  FeatureChatNicknameFormValue,
  ReactionToggleEvent,
} from '@poalim/shared-interfaces';
import {
  ChatBubbleComponent,
} from './chat-bubble/chat-bubble.component';
import { ChatStore } from './services/chat-store/chat-store.service';

@Component({
  selector: 'app-feature-chat',
  standalone: true,
  imports: [ReactiveFormsModule, MatIconModule, ChatBubbleComponent],
  templateUrl: './feature-chat.component.html',
  styleUrl: './feature-chat.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class FeatureChat implements OnInit {
  // NonNullableFormBuilder ensures form controls are never null (strict typed forms friendly).
  private readonly fb: NonNullableFormBuilder = inject(NonNullableFormBuilder);

  // Store owns state + socket I/O. Component stays focused on UI wiring.
  protected readonly chatStore: ChatStore = inject(ChatStore);

  // Centralized text to avoid random strings spread across templates.
  protected readonly UI_TEXT = UI_TEXT;

  // App-wide configuration (limits, bot name, env URLs, etc.).
  protected readonly config = AppConfig;

  // UI constants (max lengths, ids/colors, etc.).
  protected readonly chatUi = ChatUi;

  // Stable DOM ids for A11y wiring (label/aria-describedby).
  protected readonly domIds = FEATURE_CHAT_DOM_IDS;

  // Reuse one formatter instance (avoid allocating Intl objects repeatedly).
  private readonly timeFormatter: Intl.DateTimeFormat = new Intl.DateTimeFormat(
    undefined,
    {
      hour: '2-digit',
      minute: '2-digit',
    }
  );

  // Nickname form (typed via shared form-value contract).
  protected readonly nicknameForm: FormGroup<{
    username: FormControl<FeatureChatNicknameFormValue['username']>;
  }> = this.fb.group({
    username: this.fb.control(this.chatStore.username(), {
      validators: [
        Validators.required,
        Validators.minLength(AppConfig.MIN_USERNAME_LENGTH),
        Validators.maxLength(ChatUi.USER.MAX_USERNAME_LENGTH),
      ],
    }),
  });

  // Composer form (typed via shared form-value contract).
  protected readonly composerForm: FormGroup<{
    content: FormControl<FeatureChatComposerFormValue['content']>;
  }> = this.fb.group({
    content: this.fb.control('', {
      validators: [
        Validators.required,
        Validators.maxLength(AppConfig.MAX_MSG_LENGTH),
      ],
    }),
  });

  ngOnInit(): void {
    // Initializes socket listeners/effects for this feature.
    this.chatStore.init();
  }

  protected submitNickname(): void {
    // Normalize input (prevents whitespace-only names).
    const username: string = this.nicknameForm.controls.username.value.trim();
    this.nicknameForm.controls.username.setValue(username);

    // Mark touched so validation is visible for mouse + keyboard users.
    if (this.nicknameForm.invalid || !username) {
      this.nicknameForm.markAllAsTouched();
      return;
    }

    this.chatStore.submitNickname(username);
  }

  protected send(): void {
    // Normalize input (prevents whitespace-only messages).
    const content: string = this.composerForm.controls.content.value.trim();
    this.composerForm.controls.content.setValue(content);

    if (this.composerForm.invalid || !content) {
      this.composerForm.markAllAsTouched();
      return;
    }

    this.chatStore.send(content);

    // Reset keeps the input clean and prevents sticky validation UI.
    this.composerForm.reset({ content: '' });
  }

  protected onEditSubmit(e: EditSubmitEvent): void {
    // UI intent in the component, state + socket updates in the store.
    this.chatStore.editMessage(e.messageId, e.content);
  }

  protected onReactionToggle(e: ReactionToggleEvent): void {
    // Same pattern: keep the component thin.
    this.chatStore.toggleReaction(e.messageId, e.reaction);
  }

  protected logout(): void {
    // Full reset: clears local state and disconnects socket (store implementation).
    this.chatStore.logout();
    this.nicknameForm.reset({ username: '' });
    this.composerForm.reset({ content: '' });
  }

  protected formatChatTime(timestamp: number): string {
    // Defensive: avoid throwing if a timestamp is corrupted.
    const date: Date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return '';
    return this.timeFormatter.format(date);
  }

  // TrackBy keeps DOM stable and reduces re-render cost on updates.
  protected readonly trackById = (_: number, m: ChatMessage): string => m.id;
}
