import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { AppConfig, ChatUi, UIText } from '@poalim/constants';
import { LocalStorageService } from '@poalim/client-data-access';
import { ChatMessage, User } from '@poalim/shared-interfaces';

@Component({
  selector: 'app-feature-chat',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatIconModule,
    MatInputModule,
    MatFormFieldModule,
  ],
  templateUrl: './feature-chat.component.html',
  styleUrl: './feature-chat.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class FeatureChat {
  private readonly fb: NonNullableFormBuilder = inject(NonNullableFormBuilder);
  private readonly localStorageService: LocalStorageService =
    inject(LocalStorageService);

  protected readonly uiText = UIText; // UI copy comes from a shared constants file
  protected readonly config = AppConfig; // App config (limits, storage keys, bot settings)
  protected readonly chatUi = ChatUi; // UI-related constants (colors, ids, max lengths)

  private readonly storedUsername =
    this.localStorageService.getString(AppConfig.STORAGE_KEYS.USERNAME) ?? ''; // restore nickname if user refreshed

  protected readonly username = signal<string>(this.storedUsername); // current nickname used across the UI
  protected readonly messages = signal<ChatMessage[]>([]); // messages shown in the chat room (local for now)

  protected readonly hasNickname = computed(() => {
    const name = this.username().trim(); // ignore spaces around the nickname
    return name.length >= AppConfig.MIN_USERNAME_LENGTH; // decides if we show login or chat room
  });

  protected readonly me = computed<User>(() => ({
    id: this.storedUsername || ChatUi.USER.DEFAULT_ID, // keep a stable id if we already had a stored nickname
    username: this.username().trim(), // current nickname (trimmed)
    isBot: false, // this is the real user
    color: ChatUi.USER.DEFAULT_COLOR, // default user color (can be randomized later)
  }));

  protected readonly bot = computed<User>(() => ({
    id: ChatUi.BOT.ID, // fixed bot id so we can recognize bot messages
    username: AppConfig.BOT_NAME, // bot display name from config
    isBot: true, // mark as bot for styling/logic
    color: ChatUi.BOT.DEFAULT_COLOR, // brand red bot color
  }));

  protected readonly nicknameForm = this.fb.group({
    username: this.fb.control(this.storedUsername, {
      validators: [
        Validators.required, // can't submit empty nickname
        Validators.minLength(AppConfig.MIN_USERNAME_LENGTH), // basic min length rule
        Validators.maxLength(ChatUi.USER.MAX_USERNAME_LENGTH), // keep nickname reasonable for UI
      ],
    }),
  });

  protected readonly composerForm = this.fb.group({
    content: this.fb.control('', {
      validators: [
        Validators.required, // can't send empty message
        Validators.maxLength(AppConfig.MAX_MSG_LENGTH), // prevent huge payloads
      ],
    }),
  });

  protected submitNickname(): void {
    if (this.nicknameForm.invalid) {
      // block submit until nickname is valid
      this.nicknameForm.markAllAsTouched(); // show errors in the UI
      return;
    }

    const username = this.nicknameForm.controls.username.value.trim(); // trim so "   ofir " becomes "ofir"

    if (username.length < AppConfig.MIN_USERNAME_LENGTH) {
      // handle edge case: user typed only spaces
      this.nicknameForm.controls.username.setValue(username); // keep trimmed value in the input
      this.nicknameForm.markAllAsTouched(); // show validation messages
      return;
    }

    this.localStorageService.setString(
      AppConfig.STORAGE_KEYS.USERNAME,
      username
    ); // persist nickname for refresh
    this.username.set(username); // update signal (UI reacts automatically)

    if (this.messages().length === 0) {
      // only greet once when chat is empty
      this.enqueueBotGreeting();
    }
  }

  protected onComposerEnter(e: Event): void {
    e.preventDefault();
  
    if (!this.hasNickname()) return;
  
    if (this.composerForm.invalid) {
      this.composerForm.markAllAsTouched();
      return;
    }
  
    this.send();
  }
  

  protected send(): void {
    if (!this.hasNickname()) return; // don't allow sending before nickname is set

    if (this.composerForm.invalid) {
      // validate input before sending
      this.composerForm.markAllAsTouched(); // show errors in the UI
      return;
    }

    const content = this.composerForm.controls.content.value.trim(); // avoid sending spaces only
    if (!content) return; // extra guard after trim

    const msg: ChatMessage = {
      id: crypto.randomUUID(), // unique id for rendering and future syncing
      sender: this.me(), // attach the current user snapshot
      content, // message text
      timestamp: Date.now(), // used for display and ordering
      type: 'text', // normal message (not a system/bot event)
    };

    this.messages.update((prev) => [...prev, msg]); // append message immutably
    this.composerForm.reset({ content: '' }); // clear the input after sending
  }

  private enqueueBotGreeting(): void {
    const msg: ChatMessage = {
      id: crypto.randomUUID(), // unique id
      sender: this.bot(), // bot as the sender
      content: UIText.BOT.DEFAULT_GREETING, // greeting text from constants
      timestamp: Date.now(), // time of greeting
      type: 'system', // treated as a system message in the UI
    };

    window.setTimeout(() => {
      // delay to feel more natural
      this.messages.update((prev) => [...prev, msg]); // push bot message
    }, AppConfig.BOT_DELAY_MS); // delay length from config
  }

  formatChatTime(timestamp: number): string {
    const date = new Date(timestamp); // convert numeric timestamp to Date
    if (Number.isNaN(date.getTime())) return ''; // guard against invalid values

    return new Intl.DateTimeFormat(undefined, {
      hour: '2-digit', // show hour like 09 / 18
      minute: '2-digit', // show minutes like 03 / 45
    }).format(date);
  }

  protected trackById = (_: number, m: ChatMessage) => m.id; // trackBy for better list rendering performance
}
