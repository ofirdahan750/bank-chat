import { TestBed, ComponentFixture } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { UI_TEXT } from '@poalim/constants';
import { AppComponent } from './app.component';

describe('AppComponent', () => {
  let fixture: ComponentFixture<AppComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RouterTestingModule, AppComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should expose the title from UI_TEXT', () => {
    expect(fixture.componentInstance['title']).toBe(UI_TEXT.LOGIN.TITLE);
  });

  it('should render the title in the header', () => {
    const el: HTMLElement = fixture.nativeElement as HTMLElement;
    const h1: HTMLHeadingElement | null = el.querySelector('h1.app-shell__title');

    expect(h1).not.toBeNull();
    expect(h1?.textContent?.trim()).toBe(UI_TEXT.LOGIN.TITLE);
  });

  it('should render a router-outlet placeholder', () => {
    const el: HTMLElement = fixture.nativeElement as HTMLElement;
    const outlet: Element | null = el.querySelector('router-outlet');

    expect(outlet).not.toBeNull();
  });
});
