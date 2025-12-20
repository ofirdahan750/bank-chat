import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  ViewEncapsulation,
  inject,
} from '@angular/core';
import {
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
  ChatBubbleComponent,
  EditSubmitEvent,
  ReactionToggleEvent,
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
  private readonly fb: NonNullableFormBuilder = inject(NonNullableFormBuilder);
  protected readonly store: ChatStore = inject(ChatStore);

  // Text/labels are centralized to avoid "random strings" spread across the app.
  protected readonly UI_TEXT = UI_TEXT;

  // App-wide configuration (URLs, limits, bot name, etc.).
  protected readonly config = AppConfig;

  // UI-related constants (max lengths, default ids/colors, etc.).
  protected readonly chatUi = ChatUi;

  // Stable DOM ids used for label/aria-describedby wiring.
  protected readonly domIds = FEATURE_CHAT_DOM_IDS;

  // Reuse a single formatter instance (avoid creating Intl objects repeatedly).
  private readonly timeFormatter: Intl.DateTimeFormat = new Intl.DateTimeFormat(
    undefined,
    {
      hour: '2-digit',
      minute: '2-digit',
    }
  );

  // Nickname form: minimal validation, then delegate to the store.
  protected readonly nicknameForm = this.fb.group({
    username: this.fb.control(this.store.username(), {
      validators: [
        Validators.required,
        Validators.minLength(AppConfig.MIN_USERNAME_LENGTH),
        Validators.maxLength(ChatUi.USER.MAX_USERNAME_LENGTH),
      ],
    }),
  });

  // Composer form: message input only. The store owns the message list/state.
  protected readonly composerForm = this.fb.group({
    content: this.fb.control('', {
      validators: [
        Validators.required,
        Validators.maxLength(AppConfig.MAX_MSG_LENGTH),
      ],
    }),
  });

  ngOnInit(): void {
    // Store initializes socket listeners/effects once for this feature.
    this.store.init();
  }

  protected submitNickname(): void {
    // Mark touched to surface validation feedback (keyboard users included).
    const username: string = this.nicknameForm.controls.username.value.trim();
    if (this.nicknameForm.invalid || username) {
      this.nicknameForm.markAllAsTouched();
      return;
    }

    this.store.submitNickname(username);
  }

  protected send(): void {
    const content: string = this.composerForm.controls.content.value.trim();
    if (this.composerForm.invalid || !content) {
      this.composerForm.markAllAsTouched();
      return;
    }
    this.store.send(content);

    // Reset keeps the input clean and prevents sticky validation UI.
    this.composerForm.reset({ content: '' });
  }

  protected onEditSubmit(e: EditSubmitEvent): void {
    // Component stays UI-focused; store handles the actual state update + socket I/O.
    this.store.editMessage(e.messageId, e.content);
  }

  protected onReactionToggle(e: ReactionToggleEvent): void {
    // Same pattern: user intent in the component, state logic in the store.
    this.store.toggleReaction(e.messageId, e.reaction);
  }

  protected logout(): void {
    // Full reset: clears local state and disconnects socket (implemented in the store).
    this.store.logout();
    this.nicknameForm.reset({ username: '' });
    this.composerForm.reset({ content: '' });
  }

  protected formatChatTime(timestamp: number): string {
    const date: Date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return '';
    return this.timeFormatter.format(date);
  }
}
