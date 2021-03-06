import { Component, AfterViewInit, OnInit, ViewChild, ElementRef } from '@angular/core';
import { BehaviorSubject } from 'rxjs/BehaviorSubject';
import * as moment from 'moment';
import * as _ from 'lodash';

import { AdminService } from '../../shared/admin.service';
import { Conference, TimeSlot } from '../../shared/conference.model';
import { DateService } from '../../shared/date.service';
import { SessionService } from '../../shared/session.service';
import { TransitionService } from '../../shared/transition.service';
import { ToastComponent } from '../../shared/toast.component';

@Component({
  selector: 'modify-conf',
  templateUrl: './modify-conf.component.html',
  styleUrls: ['./modify-conf.component.scss']
})
export class ModifyConfComponent implements OnInit, AfterViewInit {

  @ViewChild('toast') toast: ToastComponent;

  @ViewChild('conferences') conferences: ElementRef;
  @ViewChild('dates') dates: ElementRef;
  datesSelect: HTMLSelectElement;

  selectedConf: BehaviorSubject<Conference> = new BehaviorSubject(null);
  selectedConfDates: BehaviorSubject<string[]> = new BehaviorSubject([]);
  selectedDaySlots: BehaviorSubject<TimeSlot[]> = new BehaviorSubject([]);

  @ViewChild('title') title: ElementRef;
  @ViewChild('venueName') venueName: ElementRef;
  @ViewChild('venueAddress') venueAddress: ElementRef;

  constructor(private transitionService: TransitionService,
              private adminService: AdminService,
              private dateService: DateService,
              private sessionService: SessionService) {

  }

  ngOnInit() {
    this.transitionService.transition();
    let activeConf = this.adminService.activeConference.getValue();
    this.conferences.nativeElement.value = activeConf.title;
    this.selectedConf.next(activeConf);
  }

  ngAfterViewInit() {
    this.datesSelect = this.dates.nativeElement;
    this.refreshSelectedConf();
    this.fillCurrentDetails();
  }

  updateConf(title: HTMLInputElement, venueName: HTMLInputElement, venueAddress: HTMLInputElement) {
    let currentTitle = this.selectedConf.getValue().title;
    let newTitle = title.value;
    let newVenueName = venueName.value;
    let newVenueAddress = venueAddress.value;
    if (newTitle.length < 1) {
      this.toast.error('Conference must have a title');
      return;
    }
    if (newVenueName.length < 1 || newVenueAddress.length < 1) {
      this.toast.error('Enter a venue name and address for your conference');
      return;
    }
    this.adminService
        .getAllConferences()
        .then((conferences: Conference[]) => {
          if (!this.isDuplicateTitle(conferences, newTitle, this.selectedConf.getValue().title)) {
            this.adminService.updateConference(currentTitle, newTitle, newVenueName, newVenueAddress)
              .then(res => {
                this.toast.success('Conference updated!');
                let conf = this.selectedConf.getValue();
                conf.title = newTitle;
                this.selectedConf.next(conf)
                this.refreshSelectedConf();
              });
          } else {
            this.toast.error('Conference title already exists, please choose another');
          }
        });
  }

  addTimeslot(start: HTMLInputElement, end: HTMLInputElement,
              dates: HTMLSelectElement) {
    let startVal = start.value;
    let endVal = end.value;
    let conferenceTitle = this.selectedConf.getValue().title;
    let date = this.dateService.formatDateForDatabase(dates.value);
    let startMoment = moment(`${date} ${startVal}`, this.dateService.dbFormatTimeDate, true);
    let endMoment = moment(`${date} ${endVal}`, this.dateService.dbFormatTimeDate, true);
    let startValid = startMoment.isValid();
    let endValid = endMoment.isValid();
    if (startValid && endValid) {
      if (endMoment.isSameOrBefore(startMoment)) {
        this.toast.error('The end time must be after start time');
      } else {
          this.adminService.addTimeslot(startVal, endVal, conferenceTitle, date)
              .then(res => {
                start.value = '';
                end.value = '';
                this.selectedConf.next(res);
                this.refreshSelectedConf(this.datesSelect.value);
                this.toast.success('Timeslot added!');
              });
      }
    } else if (!startValid) {
      this.toast.error('Start time invalid');
    } else if (!endValid) {
      this.toast.error('End time invalid');
    }
  }

  deleteTimeSlot(date: string, slot: TimeSlot) {
    let dbDate = this.dateService.formatDateForDatabase(date);
    let conf = this.selectedConf.getValue().title;
    this.sessionService.deleteTimeSlot(dbDate, conf, slot)
        .then(res => {
          if (res.message && res.message === 'slot has sessions') {
            this.toast.error('This slot has scheduled sessions! Remove them first to delete it.');
          } else {
            this.updateSelectedConf(this.selectedConf.getValue().title, this.datesSelect.value);
            this.toast.success('Timeslot deleted!');
          }
        });
  }

  addRoom(roomName: HTMLInputElement) {
    let conferenceTitle = this.selectedConf.getValue().title;
    let name = roomName.value;

    if (name.length < 1) {
      this.toast.error('You must enter a room name');
      return;
    } else {
      this.adminService.addRoom(conferenceTitle, name)
          .then(res => {
            this.toast.success('Room added!');
            roomName.value = '';
          });
    }
  }

  deleteRoom(room: string) {
    let conferenceTitle = this.selectedConf.getValue().title;

    this.sessionService.deleteRoom(conferenceTitle, room)
        .then(res => {
          if (res.message && res.message === 'room has sessions') {
            this.toast.error('This room has scheduled sessions! Remove them first to delete it.');
          } else {
            this.toast.success('Room removed!');
          }
        });
  }

  moveRoom(room: string, direction: string) {
    let conferenceTitle = this.selectedConf.getValue().title;
    this.adminService.moveRoom(conferenceTitle, room, direction);
  }

  updateSelectedDate(selectedDate: string) {
    let dbDate = this.dateService.formatDateForDatabase(selectedDate);
    let day = _.find(this.selectedConf.getValue().days, day => day.date === dbDate);
    // Check if we have any timeslots yet
    if (!(typeof day === 'undefined') && !(typeof day.timeSlots === 'undefined')) {
      let slots = day.timeSlots;
      slots = _.sortBy(slots, slot => slot.end);
      this.selectedDaySlots.next(slots);
    } else {
      this.selectedDaySlots.next([]);
    }
    this.conferences.nativeElement.value = this.selectedConf.getValue().title;
  }

  updateSelectedConf(confTitle: string, dateSelected?: string) {
    this.selectedConf.next(_.find(this.adminService.allConferences, d => d.title === confTitle));
    if (dateSelected) {
      this.refreshSelectedConf(dateSelected);
    } else {
      this.refreshSelectedConf();
    }
  }

  refreshSelectedConf(dateSelected?: string) {
    let startMoment = moment(this.selectedConf.getValue().dateRange.start);
    let endMoment = moment(this.selectedConf.getValue().dateRange.end);
    let dates = [];
    for (let i = startMoment; i.isSameOrBefore(endMoment); i.add(1, 'd')) {
      dates.push(i.format(this.dateService.userFormatDate));
    }
    this.selectedConfDates.next(dates.slice());
    this.fillCurrentDetails();
    let dateToRefresh = dateSelected ? dateSelected : this.selectedConfDates.getValue()[0];
    this.updateSelectedDate(dateToRefresh);
    this.conferences.nativeElement.value = this.selectedConf.getValue().title;
  }

  fillCurrentDetails() {
    this.title.nativeElement.value = this.selectedConf.getValue().title;
    if (this.selectedConf.getValue().venueName && this.selectedConf.getValue().venueAddress) {
      this.venueName.nativeElement.value = this.selectedConf.getValue().venueName;
      this.venueAddress.nativeElement.value = this.selectedConf.getValue().venueAddress;
    }
  }

  isDuplicateTitle(conferences: Conference[], newTitle: string, currentTitle) {
    if (newTitle === currentTitle) {
      return false;
    }

    let duplicateTitle = _.find(conferences, conf => conf.title.toLowerCase() === newTitle.toLowerCase());
    return typeof duplicateTitle !== 'undefined';
  }

  archiveSelectedConf(confTitle: string, archive: boolean) {
    this.adminService.archiveConf(confTitle, archive);
  }
}
