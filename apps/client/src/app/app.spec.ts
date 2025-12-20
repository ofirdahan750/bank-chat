import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { UIText } from '@poalim/constants';
import { AppComponent } from './app.component';

describe('AppComponent', () => {
  it('should create', async () => {
    // AppComponent uses RouterOutlet, so we provide an empty router config.
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    const fixture = TestBed.createComponent(AppComponent);
    const component = fixture.componentInstance;

    expect(component).toBeTruthy();
  });

  it('should render the title from UIText', async () => {
    // We validate the UI pulls the title from the centralized constants.
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    const fixture = TestBed.createComponent(AppComponent);

    // Trigger initial template render.
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement as HTMLElement;
    const titleEl = el.querySelector('.app-shell__title');

    expect(titleEl).toBeTruthy();
    expect((titleEl?.textContent ?? '').trim()).toBe(UIText.LOGIN.TITLE);
  });
});
