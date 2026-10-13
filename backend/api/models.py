from django.db import models

class Employee(models.Model):
    name = models.CharField(max_length=255)
    image = models.ImageField(upload_to='employees/', null=True, blank=True)

    def __str__(self):
        return self.name

class Attendance(models.Model):
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='attendances')
    time = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.employee.name} - {self.time}"
